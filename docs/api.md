# API 使用

API 基础地址为 `http://localhost:8080/api/v1/sales`。项目也提供了可直接导入 Postman 的 [`db-partition.postman_collection.json`](../db-partition.postman_collection.json)。

## 查询销售记录

```bash
curl http://localhost:8080/api/v1/sales
```

应用查询 `sales` 父表，PostgreSQL 会合并各个子分区的结果。

## 新增销售记录

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

## 更新销售记录

```bash
curl -X PUT http://localhost:8080/api/v1/sales/1 \
  -H 'Content-Type: application/json' \
  -d '{
    "saleDate": "2024-06-01",
    "amount": 300.00
  }'
```

修改销售日期时，PostgreSQL 会按新日期自动将记录路由至对应分区。日期仍需位于现有的 2023—2025 年分区范围内。

## 删除销售记录

```bash
curl -X DELETE http://localhost:8080/api/v1/sales/1
```

删除成功后返回 `204 No Content`。
