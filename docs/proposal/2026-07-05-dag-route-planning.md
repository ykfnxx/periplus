# Periplus 分层 DAG 规划系统提案

> 提案日期：2026-07-05
> 状态：待实现

---

## 1. 核心设计

### 1.1 分层 DAG 结构

旅行路线规划采用两层 DAG（有向无环图）结构：

- **顶层 DAG（主干路线）**：管理城市/大地点级别的经停规划
  - 节点（RouteNode）：城市、大地点
  - 边（RouteEdge）：城市间交通规划（交通方式、时长、距离、费用）
  
- **子规划 DAG（城市内部）**：每个城市节点关联一个子规划，管理市内活动
  - 节点（SubPlanNode）：景点、餐厅、酒店、活动、交通枢纽
  - 边（SubPlanEdge）：市内交通规划（步行、出租车、地铁、公交）

### 1.2 DAG 约束

- **严格线性**：每个节点最多一条入边、一条出边
- 出发节点无边，后续节点自带从上一节点来的入边
- 节点和边绑定创建，不单独操作

---

## 2. 数据模型

### 2.1 Prisma Schema

```prisma
model Route {
  id          String      @id @default(cuid())
  ownerId     String
  owner       User        @relation(fields: [ownerId], references: [id])
  name        String
  description String?
  nodes       RouteNode[]
  edges       RouteEdge[]
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
}

model RouteNode {
  id          String      @id @default(cuid())
  routeId     String
  route       Route       @relation(fields: [routeId], references: [id], onDelete: Cascade)
  name        String
  lat         Float
  lng         Float
  order       Int
  stayHours   Int?
  notes       String?
  
  outgoingEdges RouteEdge[] @relation("EdgeFrom")
  incomingEdges RouteEdge[] @relation("EdgeTo")
  subPlan     SubPlan?
  
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
}

model RouteEdge {
  id            String    @id @default(cuid())
  fromNodeId    String
  fromNode      RouteNode @relation("EdgeFrom", fields: [fromNodeId], references: [id], onDelete: Cascade)
  toNodeId      String
  toNode        RouteNode @relation("EdgeTo", fields: [toNodeId], references: [id], onDelete: Cascade)
  
  transportMode String    // 'flight', 'train', 'car', 'bus', 'walk'
  durationMinutes Int?
  distanceKm    Float?
  costEstimate  Float?
  notes         String?
  
  createdAt     DateTime  @default(now())
}

model SubPlan {
  id          String        @id @default(cuid())
  routeNodeId String        @unique
  routeNode   RouteNode     @relation(fields: [routeNodeId], references: [id], onDelete: Cascade)
  
  name        String
  nodes       SubPlanNode[]
  edges       SubPlanEdge[]
  
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
}

model SubPlanNode {
  id          String        @id @default(cuid())
  subPlanId   String
  subPlan     SubPlan       @relation(fields: [subPlanId], references: [id], onDelete: Cascade)
  
  name        String
  lat         Float
  lng         Float
  type        String        // 'sight', 'restaurant', 'hotel', 'activity', 'transit'
  durationMinutes Int?
  notes       String?
  
  outgoingEdges SubPlanEdge[] @relation("SubEdgeFrom")
  incomingEdges SubPlanEdge[] @relation("SubEdgeTo")
  
  createdAt   DateTime      @default(now())
}

model SubPlanEdge {
  id            String      @id @default(cuid())
  subPlanId     String
  subPlan       SubPlan     @relation(fields: [subPlanId], references: [id], onDelete: Cascade)
  
  fromNodeId    String
  fromNode      SubPlanNode @relation("SubEdgeFrom", fields: [fromNodeId], references: [id], onDelete: Cascade)
  toNodeId      String
  toNode        SubPlanNode @relation("SubEdgeTo", fields: [toNodeId], references: [id], onDelete: Cascade)
  
  transportMode String      // 'walk', 'taxi', 'subway', 'bus', 'rental'
  durationMinutes Int?
  distanceKm    Float?
  
  createdAt     DateTime    @default(now())
}
```

### 2.2 迁移策略

- 当前处于早期阶段，直接重写，不保留旧模型兼容
- 删除现有 `RoutePoint` 表及相关代码
- 新建 DAG 模型表

---

## 3. 地图 UI 与比例尺切换

### 3.1 视图层级

| 层级 | 比例尺范围 | 显示内容 |
|------|-----------|---------|
| **概览视图** | zoom < 12 | 顶层 DAG：城市节点 + 城市间交通边 |
| **城市视图** | zoom >= 12 | 当前视野中心最近的城市节点展开为子 DAG |

### 3.2 切换行为

1. **概览 → 城市**：zoom >= 12 时，计算地图中心点，找到最近的 RouteNode（距离阈值 5km 内），如果该节点有 SubPlan：
   - 隐藏顶层 DAG 的节点和边（除当前城市节点外，可保留为半透明背景锚点）
   - 渲染该城市的 SubPlan 节点和边
   - 子 DAG 节点使用不同视觉风格（更小、更密集的标记，颜色区分 type）

2. **城市 → 概览**：zoom < 12 时，平滑过渡回顶层 DAG 视图

3. **边界处理**：
   - zoom >= 12 但中心点 5km 内无城市节点 → 保持概览视图，显示提示"放大到城市区域查看详细规划"
   - 城市节点无 SubPlan → 显示空状态提示，提供"让 AI 生成市内规划"按钮

### 3.3 视觉区分

- **节点标记**：只用序号（①②③...），不用名称标签，不用 emoji
- **顶层节点**：大号圆形标记（32-40px）
- **子规划节点**：小号标记（16-20px），几何形状区分 type：
  - sight：圆形
  - restaurant：方形
  - hotel：菱形
  - activity：五角星
  - transit：三角形
- **顶层边**：粗实线（2-3px），颜色按交通方式区分
- **子规划边**：细虚线（1px），颜色按交通方式区分

---

## 4. AI 工作台

### 4.1 布局结构

工作区内部不使用分割线，用间距和背景色区分区域：

```
┌─────────────────────────────┐
│  [内容区：Chat / Preview]    │  ← 滚动区域
│                             │
│                             │
├─────────────────────────────┤
│  [药丸选项卡 chat preview]   │  ← 药丸形状分段按钮，输入框上方
├─────────────────────────────┤
│  [输入框...] [保存] [发送]   │  ← AIComposer
└─────────────────────────────┘
```

- 药丸外形，选中项填充 `var(--periplus-russet)` 文字白色，未选中项透明背景
- 紧贴输入框上方，与输入框同宽或略窄
- 内容区、选项卡、输入框之间用 gap / padding / margin 分隔，不使用 border

### 4.2 选项卡行为

| 状态 | 行为 |
|------|------|
| `preview`（默认） | 显示当前 DAG 概览：节点列表、总里程、预估时间、关键路径高亮 |
| 用户点击 `chat` | 切换到聊天历史视图 |
| 用户在 `preview` 状态输入并发送 | 自动切换到 `chat`，显示用户消息，触发 Agent |
| Agent 运行中 | 锁定输入，显示停止按钮 |
| Agent 建议修改（suggest 模式） | 在 `chat` 中显示 diff 卡片，用户可"接受"或"拒绝" |

### 4.3 批准模式（Codex 风格）

**模式切换**：用户可在设置中选择 `agentMode: 'auto' | 'suggest'`

- **`auto` 模式**：AI 直接应用修改，通过 WebSocket 实时推送 DAG 变更
- **`suggest` 模式**：AI 生成修改建议，以 diff 卡片形式展示在 chat 中，用户点击"接受"后应用

**Diff 卡片**：
```
┌─────────────────────────────────┐
│  AI 建议修改                     │
│  添加节点: 敦煌莫高窟           │
│  添加边: 兰州 → 敦煌 (火车 8h)  │
│                                 │
│  [查看地图]  [接受]  [拒绝]     │
└─────────────────────────────────┘
```

---

## 5. MCP 工具集（单一 MCP）

### 5.1 架构原则

- 只保留一套 MCP（`backend/mcp/`），删除现有 `mcp/` 目录
- 所有 MCP 工具操作草稿（draft-store）
- 开发时如需直接操作数据库，用 Prisma Studio 或临时脚本

### 5.2 顶层 DAG 工具

| 工具名 | 功能 |
|--------|------|
| `periplus.get_current_draft` | 读取完整草稿 |
| `periplus.replace_draft` | 替换整个草稿 |
| `periplus.route_add_start_node` | 添加出发城市（只有节点，无边） |
| `periplus.route_append_node` | 在尾部追加城市（节点 + 入边一起） |
| `periplus.route_insert_node` | 在指定节点前插入（节点 + 入边，原边重定向） |
| `periplus.route_remove_node` | 删除城市（连带入边和出边，下游节点断链） |
| `periplus.route_update_node` | 修改城市属性 |
| `periplus.route_update_edge` | 修改交通边属性 |

**`route_append_node` 参数示例**：
```json
{
  "afterNodeId": "node-xxx",
  "node": {
    "name": "敦煌",
    "lat": 40.14,
    "lng": 94.66,
    "stayHours": 48
  },
  "edge": {
    "transportMode": "train",
    "durationMinutes": 480,
    "distanceKm": 1200
  }
}
```

**`route_insert_node` 行为**：
- A → B 之间插入 C：删除原 A→B 边，新建 A→C 边 + C→B 边
- 新边属性可指定，默认复制原边属性

**`route_remove_node` 行为**：
- 删除节点 N
- 删除 N 的入边（N-1 → N）和出边（N → N+1）
- N+1 及之后节点成为断链状态（无入边）
- 前端显示为"未连接"样式，用户需重新 append 或 insert 修复

### 5.3 子规划 DAG 工具

| 工具名 | 功能 |
|--------|------|
| `periplus.subplan_create` | 为城市节点创建子规划 |
| `periplus.subplan_add_start_node` | 添加子规划出发活动（只有节点） |
| `periplus.subplan_append_node` | 追加活动（活动 + 市内交通边一起） |
| `periplus.subplan_insert_node` | 插入活动（连带边重定向） |
| `periplus.subplan_remove_node` | 删除活动（连带边） |
| `periplus.subplan_update_edge` | 修改市内交通边属性 |

### 5.4 暂不实现（YAGNI）

以下工具当前阶段不需要，后续按需添加：
- `subplan_remove` — 删除子规划可通过 `route_remove_node` 连带完成
- `subplan_node_remove` / `subplan_edge_remove` — 初期通过 `replace_draft` 全量替换
- `route_edge_update` / `subplan_node_update` — 初期通过删除+重新添加

---

## 6. 状态管理与数据流

### 6.1 Zustand 新增状态

```typescript
type ViewLevel = 'overview' | 'city'
type WorkbenchTab = 'chat' | 'preview'

interface MapState {
  // 现有状态...
  
  // 视图层级
  viewLevel: ViewLevel
  activeCityNode: RouteNode | null
  setViewLevel: (level: ViewLevel, cityNode?: RouteNode | null) => void
  
  // 工作台选项卡
  workbenchTab: WorkbenchTab
  setWorkbenchTab: (tab: WorkbenchTab) => void
  
  // Agent 批准模式
  agentMode: 'auto' | 'suggest'
  setAgentMode: (mode: 'auto' | 'suggest') => void
  pendingDiffs: DiffSuggestion[]
  acceptDiff: (diffId: string) => void
  rejectDiff: (diffId: string) => void
  
  // 当前 DAG 数据
  currentRoute: RouteDAG | null
  setCurrentRoute: (route: RouteDAG | null) => void
}
```

### 6.2 数据流

```
用户输入 → AIComposer → sendAgentEvent → WebSocket → backend/agent-runner.ts
                                                        ↓
                                              Kimi Agent + MCP 工具
                                                        ↓
                                              agentMode='auto': 直接修改草稿
                                              agentMode='suggest': 生成 diff → WebSocket
                                                        ↓
                                              WebSocket → 前端 mapStore
                                              auto: 直接更新 currentRoute
                                              suggest: 添加到 pendingDiffs
```

### 6.3 草稿 vs 持久化

- **草稿**：Agent 操作的是 DraftStore，用户确认后才保存到数据库
- **持久化**：`Save` 按钮将当前 `currentRoute` 保存到 Prisma（RouteNode + RouteEdge + SubPlan）
- **加载**：从数据库读取时组装为 `RouteDAG` 对象

---

## 7. WebSocket 消息类型

| 类型 | 方向 | 说明 |
|------|------|------|
| `agent.run.start` | 前端 → 后端 | 开始 Agent 运行 |
| `agent.run.cancel` | 前端 → 后端 | 取消运行 |
| `agent.diff.suggest` | 后端 → 前端 | suggest 模式下返回 diff 建议 |
| `agent.diff.accept` | 前端 → 后端 | 用户接受 diff |
| `agent.diff.reject` | 前端 → 后端 | 用户拒绝 diff |
| `draft.update` | 后端 → 前端 | 草稿更新（实时推送） |
| `draft.save` | 前端 → 后端 | 保存草稿到数据库 |

---

## 8. 后端 Agent 循环

### 8.1 现有循环

用户输入 → Kimi Agent → MCP 工具操作草稿 → WebSocket 推送前端

### 8.2 新增批准模式分支

**`auto` 模式**：
```
用户输入 → Agent → MCP 工具直接执行 → 草稿更新 → WebSocket 实时推送
```

**`suggest` 模式**：
```
用户输入 → Agent → 生成修改计划（不执行）→ 返回 diff 描述 → 前端显示
用户点击"接受" → 前端调用 acceptDiff → 实际执行工具 → 草稿更新
```

### 8.3 Diff 数据结构

```typescript
interface DiffSuggestion {
  id: string
  type: 'add_node' | 'remove_node' | 'insert_node' | 'append_node' | 'create_subplan' | 'add_subplan_node' | 'add_subplan_edge'
  description: string
  preview: {
    before?: unknown
    after?: unknown
  }
  toolCall: {
    tool: string
    input: Record<string, unknown>
  }
}
```

---

## 9. 实现优先级

| 优先级 | 模块 | 说明 |
|--------|------|------|
| P0 | 数据模型重写 | Prisma schema 更新，删除 RoutePoint，新建 DAG 模型 |
| P0 | 草稿存储升级 | DraftStore 支持 DAG 结构 |
| P0 | MCP 工具重构 | 绑定式 DAG 工具集 |
| P1 | 地图 DAG 渲染 | 顶层 DAG 节点/边渲染，序号标记 |
| P1 | 比例尺切换 | zoom >= 12 自动切换子规划视图 |
| P1 | 工作台选项卡 | chat/preview 药丸切换 |
| P2 | 批准模式 | suggest/auto 模式，diff 卡片 |
| P2 | 子规划渲染 | 城市视图下的子 DAG 节点/边 |
| P3 | 空状态提示 | 无子规划时的 AI 生成引导 |

---

## 10. 删除清单

实现时需删除以下旧代码：

- [ ] `mcp/` 目录（开发 MCP，合并到单一 MCP）
- [ ] `prisma/schema.prisma` 中的 `RoutePoint` 模型
- [ ] `lib/routes/` 中基于 RoutePoint 的服务代码
- [ ] `types/route.ts` 中的 RoutePoint 类型
- [ ] `backend/draft-store.ts` 中基于 RoutePoint 的草稿操作
- [ ] `backend/mcp/schemas/draft.ts` 中的旧 schema
- [ ] `backend/mcp/tools/draft.ts` 中的旧工具
- [ ] 组件中基于 RoutePoint 的渲染逻辑
