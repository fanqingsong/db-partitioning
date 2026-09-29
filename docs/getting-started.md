# 启动与开发

## 启动服务

启动 PostgreSQL、pgAdmin 和前端：

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

启动 Spring Boot 应用：

```bash
./mvnw spring-boot:run
```

应用默认监听 `http://localhost:8080`。首次启动时，Flyway 会创建父表和各年度分区。

## 配置 pgAdmin

在 pgAdmin 中注册数据库服务时，在 **Connection** 页签填写：

- Host name/address：`db`
- Port：`5432`
- Maintenance database：`partition_db`
- Username：`user`
- Password：`pass`

pgAdmin 运行在 Compose 网络内，因此 Host 应填写 PostgreSQL 服务名 `db`，而不是 `localhost`。

## 前端本地开发

Compose 通过 Nginx 容器提供销售管理界面，并将 `/api` 请求代理到宿主机的 `8080` 端口。调试 React 源码时运行：

```bash
cd frontend
npm install
npm run dev
```

访问 [http://localhost:5173](http://localhost:5173)。Vite 开发服务器同样会将 `/api` 请求代理到 `http://localhost:8080`。

页面支持销售数据的查询、新增、编辑、删除和年份筛选。

## 停止服务

```bash
docker compose down
```

如需同时删除数据库数据卷：

```bash
docker compose down -v
```
