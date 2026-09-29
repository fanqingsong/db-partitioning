# Spring Boot PostgreSQL Partitioning Demo

这是一个使用 **Spring Boot、Spring Data JPA、Flyway 和 PostgreSQL 声明式分区**实现的示例项目。项目按照销售日期对 `sales` 表进行范围分区，应用只操作父表，由 PostgreSQL 自动完成数据路由和分区裁剪。

## 技术栈

- Java 21
- Spring Boot 3.5.x
- Spring Data JPA
- Flyway
- PostgreSQL 16
- React 19 + Vite
- Docker Compose
- pgAdmin

## 分区实现

分区由 Flyway 脚本
`src/main/resources/db/migration/V1__create_sales_partitioned_table.sql`
创建。应用启动后，Flyway 会自动执行该脚本。

### 1. 创建分区父表

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

### 2. 创建年度范围分区

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

### 3. 应用层如何使用分区

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
}
```

业务代码不需要判断或直接访问 `sales_2023`、`sales_2024` 等子表。写入父表时，PostgreSQL 根据 `sale_date` 自动选择分区；查询包含分区键条件时，查询优化器可以跳过无关分区。

## 项目结构

```text
src/main/java/com/example/partitioning
├── controller     # REST API
├── entity         # JPA 实体
├── repository     # 数据访问层
└── service        # 业务逻辑
src/main/resources
├── application.yml
└── db/migration   # Flyway 分区建表脚本
```

## 启动项目

### 1. 启动 PostgreSQL、pgAdmin 和前端

```bash
docker compose up -d --build
```

服务信息：

- PostgreSQL：`localhost:5433`
  - 数据库：`partition_db`
  - 用户名：`user`
  - 密码：`pass`
- pgAdmin：[http://localhost:5050](http://localhost:5050)
  - 邮箱：`admin@admin.com`
  - 密码：`admin`
- 销售管理界面：[http://localhost:3000](http://localhost:3000)

在 pgAdmin 中注册数据库服务时，在 **Connection** 页签填写：

- Host name/address：`db`
- Port：`5432`
- Maintenance database：`partition_db`
- Username：`user`
- Password：`pass`

由于 pgAdmin 运行在 Compose 网络内，Host 应填写 PostgreSQL 服务名 `db`，而不是 `localhost`。

### 2. 启动 Spring Boot 应用

```bash
./mvnw spring-boot:run
```

应用默认监听 `http://localhost:8080`。首次启动时，Flyway 会创建父表和各年度分区。

### 3. 前端本地开发（可选）

Compose 已通过 Nginx 容器提供销售管理界面，并将 `/api` 请求代理到宿主机
`8080` 端口。需要调试 React 源码时，可另开一个终端运行：

```bash
cd frontend
npm install
npm run dev
```

访问 [http://localhost:5173](http://localhost:5173)。Vite 开发服务器同样会将
`/api` 请求代理到 `http://localhost:8080`。页面支持销售数据的查询、新增、编辑、
删除和年份筛选。

## API 使用

项目也提供了可直接导入 Postman 的
`db-partition.postman_collection.json`。

### 新增销售记录

```bash
curl -X POST http://localhost:8080/api/v1/sales \
  -H 'Content-Type: application/json' \
  -d '{
    "saleDate": "2024-03-15",
    "amount": 250.00
  }'
```

示例响应：

```json
{
  "id": 1,
  "saleDate": "2024-03-15",
  "amount": 250.0
}
```

该记录会自动写入 `sales_2024` 分区。

### 查询全部销售记录

```bash
curl http://localhost:8080/api/v1/sales
```

应用查询的是 `sales` 父表，PostgreSQL 会合并各子分区的结果。

## 为什么按时间分区

表分区与分库分表不同：当前所有分区仍位于同一个 PostgreSQL 数据库中，由数据库统一管理和查询。只有数据量较大，并且查询、归档或清理操作通常带有时间范围时，按时间分区才会体现出明显优势。

### 优点

1. **加速时间范围查询**

   查询条件包含 `sale_date` 时，PostgreSQL 可以进行分区裁剪，只扫描符合条件的分区。例如查询 2024 年数据时，通常只扫描 `sales_2024`。

2. **方便清理和归档历史数据**

   可以直接删除或分离整个历史分区。相比对大表执行大量 `DELETE`，这种方式通常更快，也不会产生大量死元组。

   ```sql
   DROP TABLE sales_2023;
   ```

3. **降低单次维护范围**

   每个分区拥有独立的索引和统计信息，可以按分区执行 `VACUUM`、`ANALYZE`、索引重建、备份和归档。

4. **隔离历史数据和当前写入**

   新数据主要写入当前年度分区，历史分区则较为稳定，可以设置不同的维护或存储策略。

### 缺点

1. **不带时间条件的查询收益有限**

   当前 `GET /api/v1/sales` 会读取全部数据，需要扫描所有分区。数据量较小时，分区还可能增加查询规划开销。

2. **需要提前维护未来分区**

   当前只创建了 2023、2024 和 2025 年分区。写入其他年份的数据时，如果没有匹配分区，请求将失败。

3. **主键和唯一约束更加复杂**

   PostgreSQL 要求分区表上的主键或唯一约束包含分区键，因此当前数据库主键为 `(id, sale_date)`。当前 JPA 实体仅将 `id` 映射为 `@Id`，两者语义并不完全一致；在更完整的生产实现中，应使用复合主键映射或重新设计标识方案。

4. **修改分区键可能移动数据**

   将 `sale_date` 修改到另一个年份时，PostgreSQL 需要把记录从原分区移动到目标分区。

5. **分区不能代替索引**

   分区只能减少需要扫描的分区。对于分区内部经常使用的其他查询条件，仍需创建合适的索引。

6. **分区过多会增加管理成本**

   过细的分区粒度会增加元数据和查询规划开销。应根据数据量和访问模式选择按年、按月或按日分区。

对于数据量较小或者查询很少包含 `sale_date` 的场景，普通表配合日期索引通常更加简单：

```sql
CREATE INDEX idx_sales_sale_date ON sales (sale_date);
```

## 更新分区数据

更新数据时仍然操作父表 `sales`，不需要直接访问 `sales_2023`、`sales_2024` 等具体分区。

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

修改后的日期仍然属于原年份时，记录不会跨分区：

```sql
UPDATE sales
SET sale_date = DATE '2024-06-01'
WHERE id = 1
  AND sale_date = DATE '2024-03-15';
```

如果日期被修改到另一个年份，PostgreSQL 会自动将记录从原分区移动到目标分区：

```sql
UPDATE sales
SET sale_date = DATE '2025-06-01'
WHERE id = 1
  AND sale_date = DATE '2024-03-15';
```

以上记录会从 `sales_2024` 移动到 `sales_2025`。目标日期必须存在对应分区，否则更新会失败。例如当前没有 `sales_2026`，因此无法将日期更新到 2026 年。

对于销售、订单等数据，通常建议将时间分区键设计为创建后不可修改，只更新金额、状态等普通字段，避免频繁发生跨分区移动。

### 通过 API 更新和删除

```bash
curl -X PUT http://localhost:8080/api/v1/sales/1 \
  -H 'Content-Type: application/json' \
  -d '{"saleDate":"2024-06-01","amount":300.00}'

curl -X DELETE http://localhost:8080/api/v1/sales/1
```

Web 管理界面已封装上述操作。修改销售日期时，PostgreSQL 会按新日期自动将记录
路由至对应分区；日期仍需处于现有的 2023—2025 年分区范围内。

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

示例结果：

```text
 partition_name | id | sale_date  | amount
----------------+----+------------+--------
 sales_2023     |  1 | 2023-02-15 | 150.75
 sales_2024     |  2 | 2024-03-15 | 250.00
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

写入新年度的数据前必须先创建对应分区。生产项目中应通过新的 Flyway 迁移脚本扩展，避免修改已经执行过的 `V1` 脚本。例如新建：

`src/main/resources/db/migration/V2__create_sales_2026_partition.sql`

```sql
CREATE TABLE sales_2026 PARTITION OF sales
    FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
```

重新启动应用后，Flyway 会执行 `V2` 迁移，此后即可写入 2026 年的数据。

### 日期没有匹配分区时的处理

如果新增数据的 `sale_date` 不属于任何已有分区，PostgreSQL 不会自动创建分区，而是拒绝插入并回滚当前语句。例如当前项目写入 2026 年数据时会出现：

```text
ERROR: no partition of relation "sales" found for row
SQLSTATE: 23514
```

生产环境可以根据业务要求选择以下处理方式。

#### 方式一：提前创建分区（推荐）

通过 Flyway 提前创建未来一至数年的分区，或者由定时管理任务在新周期到来前创建分区。这种方式的数据边界最清晰，查询裁剪和日常维护也最可控。

不建议在插入失败后立即由业务请求执行建表操作。多个请求并发创建同一个分区时，可能产生 DDL 锁竞争、重复建表和复杂的事务重试，而且应用账号还需要额外的建表权限。

#### 方式二：增加默认分区

如果业务不能拒绝超出预期日期的数据，可以创建一个兜底分区：

```sql
CREATE TABLE sales_default PARTITION OF sales DEFAULT;
```

此后，没有匹配年度分区的数据会进入 `sales_default`。默认分区应作为临时缓冲区，并对其中的数据进行监控，避免数据长期堆积。

后续创建正式分区前，必须先迁移默认分区中落在该范围内的数据，否则 PostgreSQL 会因默认分区中存在范围冲突的数据而拒绝创建新分区。例如迁移 2026 年数据：

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

#### 方式三：应用层提前校验

应用可以在写入前检查日期是否位于支持范围内，并返回明确的客户端错误，例如：

```json
{
  "message": "No sales partition exists for year 2026"
}
```

应用层校验可以改善接口体验，但不能替代数据库约束，因为其他程序仍可能直接写入数据库。比较稳妥的组合是：

1. 使用 Flyway 提前创建未来分区。
2. 在应用层校验日期并返回友好错误。
3. 只有业务不允许拒绝数据时，才增加 `DEFAULT` 分区，并持续监控和迁移其中的数据。

## 停止环境

```bash
docker compose down
```

如需同时删除数据库数据卷，可使用：

```bash
docker compose down -v
```