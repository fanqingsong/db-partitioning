# 分区设计与维护

## 分区实现

分区由 Flyway 脚本 [`V1__create_sales_partitioned_table.sql`](../src/main/resources/db/migration/V1__create_sales_partitioned_table.sql) 创建。应用启动后，Flyway 会自动执行该脚本。

### 创建分区父表

```sql
CREATE TABLE sales (
    id SERIAL,
    sale_date DATE NOT NULL,
    amount NUMERIC NOT NULL,
    PRIMARY KEY (id, sale_date)
) PARTITION BY RANGE (sale_date);
```

- `sales` 是逻辑父表，应用始终对它进行读写。
- `sale_date` 是分区键。
- PostgreSQL 要求分区表的主键包含分区键，因此主键为 `(id, sale_date)`。

### 创建年度范围分区

```sql
CREATE TABLE sales_2023 PARTITION OF sales
    FOR VALUES FROM ('2023-01-01') TO ('2024-01-01');

CREATE TABLE sales_2024 PARTITION OF sales
    FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');

CREATE TABLE sales_2025 PARTITION OF sales
    FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
```

范围的下界包含、上界不包含。例如：

- `2024-01-01` 至 `2024-12-31` 的数据进入 `sales_2024`。
- `2025-01-01` 的数据进入 `sales_2025`。
- 当前仅支持 2023、2024 和 2025 年的数据；写入其他日期会因没有匹配分区而失败。

### 应用层如何使用分区

JPA 实体映射到父表：

```java
@Entity
@Table(name = "sales")
public class Sale {
    // ...
}
```

Repository 仍然是普通的 `JpaRepository`：

```java
public interface SaleRepository extends JpaRepository<Sale, Long> {
    // ...
}
```

业务代码不需要判断或直接访问 `sales_2023`、`sales_2024` 等子表。写入父表时，PostgreSQL 根据 `sale_date` 自动选择分区；查询包含分区键条件时，查询优化器可以跳过无关分区。

## 为什么按时间分区

表分区与分库分表不同：当前所有分区仍位于同一个 PostgreSQL 数据库中，由数据库统一管理和查询。只有数据量较大，并且查询、归档或清理操作通常带有时间范围时，按时间分区才会体现出明显优势。

### 优点

1. **加速时间范围查询**：查询条件包含 `sale_date` 时，PostgreSQL 可以进行分区裁剪，只扫描符合条件的分区。
2. **方便清理和归档历史数据**：可以直接删除或分离整个历史分区，避免大量 `DELETE` 产生死元组。
3. **降低单次维护范围**：每个分区拥有独立的索引和统计信息，可以按分区维护、备份和归档。
4. **隔离历史数据和当前写入**：新数据主要写入当前年度分区，历史分区可以采用不同的维护或存储策略。

例如，删除整个历史分区：

```sql
DROP TABLE sales_2023;
```

### 缺点

1. **不带时间条件的查询收益有限**：当前 `GET /api/v1/sales` 需要扫描所有分区。
2. **需要提前维护未来分区**：写入没有匹配分区的年份时会失败。
3. **主键和唯一约束更加复杂**：分区表上的主键或唯一约束必须包含分区键。当前数据库主键为 `(id, sale_date)`，但 JPA 实体仅将 `id` 映射为 `@Id`，两者语义并不完全一致。生产实现应使用复合主键映射或重新设计标识方案。
4. **修改分区键可能移动数据**：将 `sale_date` 修改到另一个年份时，PostgreSQL 需要将记录移至目标分区。
5. **分区不能代替索引**：分区内部经常使用的其他查询条件仍需创建合适的索引。
6. **分区过多会增加管理成本**：应根据数据量和访问模式选择按年、按月或按日分区。

对于数据量较小或查询很少包含 `sale_date` 的场景，普通表配合日期索引通常更简单：

```sql
CREATE INDEX idx_sales_sale_date ON sales (sale_date);
```

## 更新分区数据

更新数据时仍然操作父表 `sales`，不需要直接访问具体分区。

### 更新普通字段

只修改 `amount` 等非分区字段时，记录仍然保留在原分区：

```sql
UPDATE sales
SET amount = 300.00
WHERE id = 1
  AND sale_date = DATE '2024-03-15';
```

查询条件包含 `sale_date` 可以触发分区裁剪，并与数据库复合主键 `(id, sale_date)` 保持一致。

### 修改分区键

修改后的日期仍属于原年份时，记录不会跨分区：

```sql
UPDATE sales
SET sale_date = DATE '2024-06-01'
WHERE id = 1
  AND sale_date = DATE '2024-03-15';
```

如果日期被修改到另一个年份，PostgreSQL 会自动将记录移至目标分区：

```sql
UPDATE sales
SET sale_date = DATE '2025-06-01'
WHERE id = 1
  AND sale_date = DATE '2024-03-15';
```

目标日期必须存在对应分区，否则更新会失败。对于销售、订单等数据，通常建议将时间分区键设计为创建后不可修改。

## 验证分区

进入 PostgreSQL：

```bash
docker compose exec db psql -U user -d partition_db
```

查看每条记录实际所在的分区：

```sql
SELECT tableoid::regclass AS partition_name, id, sale_date, amount
FROM sales
ORDER BY id;
```

查看父表下的所有分区：

```sql
SELECT
    parent.relname AS parent_table,
    child.relname AS partition_table
FROM pg_inherits
JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
JOIN pg_class child ON pg_inherits.inhrelid = child.oid
WHERE parent.relname = 'sales'
ORDER BY child.relname;
```

验证分区裁剪：

```sql
EXPLAIN
SELECT *
FROM sales
WHERE sale_date >= DATE '2024-01-01'
  AND sale_date < DATE '2025-01-01';
```

执行计划应只扫描 `sales_2024`，而不是全部年度分区。

## 扩展新分区

写入新年度的数据前必须先创建对应分区。生产项目中应通过新的 Flyway 迁移脚本扩展，避免修改已经执行过的 `V1` 脚本。

例如新建 `src/main/resources/db/migration/V2__create_sales_2026_partition.sql`：

```sql
CREATE TABLE sales_2026 PARTITION OF sales
    FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
```

重新启动应用后，Flyway 会执行 `V2` 迁移，此后即可写入 2026 年的数据。

## 日期没有匹配分区时的处理

如果 `sale_date` 不属于任何已有分区，PostgreSQL 不会自动创建分区，而是拒绝插入并回滚当前语句：

```text
ERROR: no partition of relation "sales" found for row
SQLSTATE: 23514
```

### 提前创建分区（推荐）

通过 Flyway 提前创建未来一至数年的分区，或者由定时管理任务在新周期到来前创建分区。

不建议在插入失败后立即由业务请求执行建表操作。多个请求并发创建同一个分区时，可能产生 DDL 锁竞争、重复建表和复杂的事务重试，而且应用账号还需要额外的建表权限。

### 增加默认分区

如果业务不能拒绝超出预期日期的数据，可以创建一个兜底分区：

```sql
CREATE TABLE sales_default PARTITION OF sales DEFAULT;
```

默认分区应作为临时缓冲区，并对其中的数据进行监控。创建正式分区前，必须先迁移默认分区中落在该范围内的数据：

```sql
BEGIN;

CREATE TEMP TABLE sales_2026_buffer AS
SELECT *
FROM sales_default
WHERE sale_date >= DATE '2026-01-01'
  AND sale_date < DATE '2027-01-01';

DELETE FROM sales_default
WHERE sale_date >= DATE '2026-01-01'
  AND sale_date < DATE '2027-01-01';

CREATE TABLE sales_2026 PARTITION OF sales
    FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

INSERT INTO sales
SELECT * FROM sales_2026_buffer;

COMMIT;
```

### 应用层提前校验

应用可以在写入前检查日期是否位于支持范围内，并返回明确的客户端错误：

```json
{
  "message": "No sales partition exists for year 2026"
}
```

应用层校验可以改善接口体验，但不能替代数据库约束。比较稳妥的组合是：

1. 使用 Flyway 提前创建未来分区。
2. 在应用层校验日期并返回友好错误。
3. 只有业务不允许拒绝数据时，才增加 `DEFAULT` 分区，并持续监控和迁移其中的数据。
