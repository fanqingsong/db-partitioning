# Spring Boot PostgreSQL Partitioning Demo

这是一个使用 **Spring Boot、Spring Data JPA、Flyway 和 PostgreSQL 声明式分区**实现的示例项目。项目按照销售日期对 `sales` 表进行范围分区，应用只操作父表，由 PostgreSQL 自动完成数据路由和分区裁剪。

## 技术栈

- Java 21
- Spring Boot 3.5.x
- Spring Data JPA
- Flyway
- PostgreSQL 16
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

### 1. 启动 PostgreSQL 和 pgAdmin

```bash
docker compose up -d
```

服务信息：

- PostgreSQL：`localhost:5433`
  - 数据库：`partition_db`
  - 用户名：`user`
  - 密码：`pass`
- pgAdmin：[http://localhost:5050](http://localhost:5050)
  - 邮箱：`admin@admin.com`
  - 密码：`admin`

在 pgAdmin 中注册数据库服务时，由于 pgAdmin 运行在 Compose 网络内，应使用：

- Host：`db`
- Port：`5432`
- Maintenance database：`partition_db`
- Username：`user`
- Password：`pass`

### 2. 启动 Spring Boot 应用

```bash
./mvnw spring-boot:run
```

应用默认监听 `http://localhost:8080`。首次启动时，Flyway 会创建父表和各年度分区。

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

## 停止环境

```bash
docker compose down
```

如需同时删除数据库数据卷，可使用：

```bash
docker compose down -v
```