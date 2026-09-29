# Spring Boot PostgreSQL Partitioning Demo

这是一个使用 **Spring Boot、Spring Data JPA、Flyway 和 PostgreSQL 声明式分区**实现的示例项目。项目按照销售日期对 `sales` 表进行年度范围分区，由 PostgreSQL 自动完成数据路由和分区裁剪，并提供 React 管理界面。

## 技术栈

- Java 21、Spring Boot 3.5.x、Spring Data JPA、Flyway
- PostgreSQL 16、pgAdmin
- React 19、Vite、Nginx
- Docker Compose

## 快速开始

启动 PostgreSQL、pgAdmin 和前端：

```bash
docker compose up -d --build
```

启动后端：

```bash
./mvnw spring-boot:run
```

访问以下服务：

- 销售管理界面：[http://localhost:3000](http://localhost:3000)
- REST API：`http://localhost:8080/api/v1/sales`
- pgAdmin：[http://localhost:5050](http://localhost:5050)
- PostgreSQL：`localhost:5433`

当前数据库包含 2023、2024 和 2025 年分区，销售日期必须位于该范围内。

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
frontend           # React 管理界面
docs               # 详细文档
```

## 文档

- [启动与开发](docs/getting-started.md)：服务配置、pgAdmin 连接和前端开发
- [API 使用](docs/api.md)：销售记录的查询、新增、更新和删除
- [分区设计与维护](docs/partitioning.md)：实现原理、取舍、验证和扩展分区

项目还提供了可直接导入 Postman 的
[`db-partition.postman_collection.json`](db-partition.postman_collection.json)。