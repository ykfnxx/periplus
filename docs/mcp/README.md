# Periplus MCP Server

当前 MCP 实现是一个独立 stdio 进程，用于让 Agent 直接操作 Periplus 路线数据。Web 端现有 Next API 路径保持不变。

```text
Agent
  -> MCP stdio
  -> mcp/server.ts
  -> mcp/tools/routes.ts
  -> lib/routes/service.ts
  -> Prisma / SQLite
```

## 运行方式

开发期启动：

```bash
npm run dev:mcp
```

脚本定义：

```json
{
  "dev:mcp": "tsx mcp/server.ts"
}
```

MCP server 使用同一个 `DATABASE_URL` 访问当前 Prisma SQLite 数据库。启动 Web 页面不是 MCP 运行的前置条件。

## 文件结构

```text
mcp/
  server.ts
  tools/
    routes.ts
  schemas/
    routes.ts
  errors.ts
```

- `mcp/server.ts`：创建 `McpServer`，注册路线工具，连接 `StdioServerTransport`。
- `mcp/tools/routes.ts`：注册 `periplus.*` 工具，并把 MCP 调用转给 route service。
- `mcp/schemas/routes.ts`：定义工具输入 schema。
- `mcp/errors.ts`：把 service 层错误转换为 MCP text result。

共享业务核心在 `lib/routes/service.ts`。MCP 不调用前端 `lib/routes/client.ts`，也不经过 `app/api/routes/*`。

## 工具列表

### `periplus.list_routes`

输入：

```json
{}
```

输出：`RouteDto[]`

### `periplus.get_route`

输入：

```json
{
  "id": "route-id"
}
```

输出：`RouteDto`

### `periplus.create_route`

输入：

```json
{
  "name": "杭州三日",
  "description": "古迹和美食",
  "points": [
    {
      "name": "灵隐寺",
      "lat": 30.2401,
      "lng": 120.1023,
      "order": 0,
      "stayHours": 1.5,
      "notes": "上午去"
    }
  ]
}
```

输出：`RouteDto`

### `periplus.update_route`

输入：

```json
{
  "id": "route-id",
  "route": {
    "name": "杭州三日",
    "points": [
      {
        "name": "西湖",
        "lat": 30.246,
        "lng": 120.146,
        "order": 0
      }
    ]
  }
}
```

输出：`RouteDto`

这是整条路线替换能力。日常细粒度编辑优先使用 point 级工具。

### `periplus.delete_route`

输入：

```json
{
  "id": "route-id"
}
```

输出：

```json
{
  "deleted": true
}
```

## Point 级工具

Point 级工具支持相对位置：

```json
{ "placement": "start" }
{ "placement": "end" }
{ "placement": "before", "pointId": "anchor-point-id" }
{ "placement": "after", "pointId": "anchor-point-id" }
```

### `periplus.add_route_point`

输入：

```json
{
  "routeId": "route-id",
  "point": {
    "name": "河坊街",
    "lat": 30.242,
    "lng": 120.171,
    "stayHours": 1,
    "notes": "晚上去"
  },
  "position": {
    "placement": "after",
    "pointId": "point-1"
  }
}
```

输出：更新后的 `RouteDto`

`position` 可省略，默认追加到路线末尾。

### `periplus.update_route_point`

输入：

```json
{
  "routeId": "route-id",
  "pointId": "point-id",
  "patch": {
    "name": "灵隐寺飞来峰",
    "stayHours": 2,
    "notes": null
  },
  "position": {
    "placement": "before",
    "pointId": "point-2"
  }
}
```

输出：更新后的 `RouteDto`

`patch` 和 `position` 至少传一个。不传 `position` 时只更新点位内容；不传 `patch` 时只移动点位。

### `periplus.delete_route_point`

输入：

```json
{
  "routeId": "route-id",
  "pointId": "point-id"
}
```

输出：更新后的 `RouteDto`

### `periplus.reorder_route_points`

输入：

```json
{
  "routeId": "route-id",
  "pointIds": ["point-2", "point-1", "point-3"]
}
```

输出：更新后的 `RouteDto`

`pointIds` 必须包含该路线下所有 point，且不能重复。

## 返回格式

工具返回 MCP text content，文本内容是格式化 JSON。

成功时：

```json
{
  "content": [
    {
      "type": "text",
      "text": "{ ...json... }"
    }
  ]
}
```

service 层错误会被包装为：

```json
{
  "error": {
    "code": "invalid_input | not_found | internal_error",
    "message": "可读错误信息"
  }
}
```

注册到 MCP SDK 的工具仍保留 `inputSchema`。因此，部分输入格式错误会先被 SDK 按 MCP 协议返回标准参数校验错误，而不是进入 service 层错误包装。

## 当前边界

- 仅支持 stdio transport。
- 暂无 MCP Token、用户身份或权限模型。
- 暂无 Spot、攻略、照片后端化工具。
- Web 端仍通过 Next API routes 调用路线服务。
- MCP 与 Web 当前共享同一套 `lib/routes/service.ts` 和 Prisma SQLite 数据库。

## 验证命令

```bash
npm run typecheck
npm run test
npm run build
```

MCP 启动 smoke test：

```bash
npm run dev:mcp
```
