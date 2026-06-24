# Periplus 旅行轨迹规划平台 - 设计文档

> 项目代号：Periplus（取自希腊语"环绕航行"，寓意探索世界的旅程）
> 版本：v0.1.0
> 日期：2026-06-24
> 状态：草案待审

---

## 1. 项目概述

### 1.1 目标

构建一个以可交互地图为核心的旅行规划与分享平台。用户可以在地图上查看、创建和编辑旅行轨迹，直观规划行程路线。

### 1.2 核心原则

- **地图优先**：地图是核心交互界面，所有功能围绕地图展开
- **渐进增强**：先实现基础功能，再逐步添加 AI 等高级特性
- **国内优先**：第一阶段聚焦中国地图场景
- **YAGNI**：不实现当前阶段不需要的功能

### 1.3 非目标（明确排除）

- ❌ 真实道路路径规划（使用直线连接）
- ❌ 实时导航/语音播报
- ❌ 社交功能（关注、点赞、评论）
- ❌ 多语言支持（仅中文）
- ❌ 移动端 App（仅 Web）
- ❌ AI 智能规划（v0.1.0 仅提供 Mock 接口）
- ❌ 在线分享链接（v0.1.0 仅本地保存）
- ❌ 数据导出 GPX/KML（v0.1.0 仅 JSON）

---

## 2. 功能需求

### 2.1 地图视图层（Map View）

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 全屏地图 | 地图占据主要视口，支持缩放、平移 | P0 |
| 底图切换 | 标准/卫星/地形三种模式 | P1 |
| 标记点（Marker） | 在地图上显示地点标记，支持点击 | P0 |
| 轨迹线（Polyline） | 用直线连接各标记点，显示旅行路线 | P0 |
| 信息窗（InfoWindow） | 点击标记点弹出地点名称和基本信息 | P1 |
| 自动适配视野 | 加载轨迹后自动缩放到合适视野范围 | P1 |
| 图层控制 | 显示/隐藏标记点或轨迹线 | P2 |

### 2.2 路线管理（Route Management）

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 查看预设路线 | 首页展示预置路线，点击进入地图 | P0 |
| 创建新路线 | 空白地图，手动添加地点 | P0 |
| 编辑路线 | 增删改轨迹点，拖拽排序 | P0 |
| 保存路线 | 保存到本地数据库 | P0 |
| 删除路线 | 删除已保存的路线 | P1 |
| 路线列表 | 侧边栏展示所有已保存路线 | P1 |

### 2.3 坐标调试（Debug）

| 功能 | 描述 | 优先级 |
|------|------|--------|
| JSON 输入 | 输入坐标数组 JSON，即时绘制轨迹 | P0 |
| 格式验证 | 验证 JSON 格式和坐标范围 | P1 |
| 错误提示 | 格式错误时给出明确提示 | P1 |

### 2.4 Mock AI 规划（Mock AI Planner）

| 功能 | 描述 | 优先级 |
|------|------|--------|
| Mock 接口 | 提供固定响应的 API 端点，模拟 AI 解析 | P1 |
| 预设路线数据 | 返回预置的丝绸之路路线数据 | P1 |

---

## 3. 数据模型

### 3.1 实体关系

```
Route (路线)
├── id: UUID (PK)
├── name: String
├── description: String
├── createdAt: DateTime
├── updatedAt: DateTime
└── points: RoutePoint[] (1:N)

RoutePoint (轨迹点)
├── id: UUID (PK)
├── routeId: UUID (FK)
├── name: String
├── lat: Float (纬度, -90 ~ 90)
├── lng: Float (经度, -180 ~ 180)
├── order: Int (顺序索引)
├── stayDays: Int? (停留天数, 可选)
└── notes: String? (备注, 可选)
```

### 3.2 预设路线：丝绸之路

```json
{
  "name": "丝绸之路",
  "description": "从长安出发，经河西走廊至西域的经典路线",
  "points": [
    {"name": "西安", "lat": 34.3416, "lng": 108.9398, "stayDays": 3, "notes": "起点，兵马俑、大雁塔"},
    {"name": "兰州", "lat": 36.0611, "lng": 103.8343, "stayDays": 2, "notes": "黄河风情线、牛肉面"},
    {"name": "张掖", "lat": 38.9259, "lng": 100.4498, "stayDays": 2, "notes": "七彩丹霞、大佛寺"},
    {"name": "嘉峪关", "lat": 39.7728, "lng": 98.2892, "stayDays": 1, "notes": "天下第一雄关"},
    {"name": "敦煌", "lat": 40.1421, "lng": 94.6615, "stayDays": 3, "notes": "莫高窟、鸣沙山月牙泉"},
    {"name": "吐鲁番", "lat": 42.9513, "lng": 89.1897, "stayDays": 2, "notes": "火焰山、葡萄沟"},
    {"name": "乌鲁木齐", "lat": 43.8256, "lng": 87.6168, "stayDays": 2, "notes": "终点，新疆首府"}
  ]
}
```

---

## 4. 技术架构

### 4.1 架构图

```
┌─────────────────────────────────────────┐
│              客户端 (Browser)              │
│  ┌──────────────┐  ┌──────────────────┐  │
│  │   页面层      │  │    地图组件层      │  │
│  │  - 首页       │  │  - MapContainer  │  │
│  │  - 地图页     │  │  - RoutePolyline │  │
│  │  - Debug页   │  │  - RouteMarkers  │  │
│  └──────────────┘  └──────────────────┘  │
│  ┌──────────────┐  ┌──────────────────┐  │
│  │   状态管理    │  │    高德地图 SDK   │  │
│  │  - Zustand   │  │  - JS API 2.0    │  │
│  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────┘
                    │
                    ▼ HTTP/REST
┌─────────────────────────────────────────┐
│           Next.js API Routes            │
│  ┌──────────────┐  ┌──────────────────┐  │
│  │   路由 API    │  │   Mock AI API    │  │
│  │  - CRUD      │  │  - 固定响应       │  │
│  └──────────────┘  └──────────────────┘  │
│  ┌──────────────┐  ┌──────────────────┐  │
│  │    Prisma    │  │   SQLite/PostgreSQL│  │
│  │   ORM 层     │  │    数据库层       │  │
│  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────┘
```

### 4.2 技术栈

| 层级 | 技术 | 版本 | 说明 |
|------|------|------|------|
| 运行时 | Node.js | 20.x | LTS |
| 框架 | Next.js | 15.x | App Router |
| 语言 | TypeScript | 5.x | 严格模式 |
| 样式 | Tailwind CSS | 4.x | |
| 组件 | shadcn/ui | latest | 基于 Radix UI |
| 地图 | 高德地图 JS API | 2.0 | 需申请 Key |
| 数据库 | SQLite | 3 | 开发环境 |
| ORM | Prisma | 6.x | |
| 状态 | Zustand | 5.x | 轻量状态管理 |
| 测试 | Vitest | 3.x | 单元测试 |
| 测试 | Playwright | 1.x | E2E 测试 |

### 4.3 高德地图接入

- 申请高德开放平台 Key（Web端 JS API）
- 使用 Loader 方式加载：`AMapLoader.load({ key, version: '2.0' })`
- 安全密钥配置：使用白名单限制域名
- 免费额度：日 1 万次调用，足够开发和小规模使用

### 4.4 地图渲染组件方案

**核心方案：高德地图 JS API 2.0 + @amap/amap-jsapi-loader**

```
加载方式：
  @amap/amap-jsapi-loader (npm 包)
    ↓
  AMapLoader.load({ key, version: '2.0', plugins: [...] })
    ↓
  初始化 AMap.Map 实例 → 绑定到 div 容器
    ↓
  通过 AMap API 创建覆盖物：
    - AMap.Marker (标记点)
    - AMap.Polyline (轨迹线)
    - AMap.InfoWindow (信息窗)
```

**为什么不使用 React 地图组件库？**

| 方案 | 说明 | 不选用的原因 |
|------|------|-------------|
| react-amap | 高德官方 React 封装 | 已停止维护，不支持 JS API 2.0 |
| @uiw/react-amap | 社区 React 封装 | 额外抽象层，增加学习成本，v0.1.0 不需要 |
| 原生 AMap API | 直接调用高德 JS API | ✅ 选用。官方文档完善，无封装层损耗，完全控制 |

**React 集成方式：**

在 React 组件中通过 `useEffect` + `useRef` 管理地图生命周期：

```typescript
// 伪代码
const mapRef = useRef<HTMLDivElement>(null);
const mapInstanceRef = useRef<AMap.Map | null>(null);

useEffect(() => {
  AMapLoader.load({ key, version: '2.0.0' }).then((AMap) => {
    mapInstanceRef.current = new AMap.Map(mapRef.current, {
      zoom: 5,
      center: [104, 36], // 中国中心
    });
  });
  
  return () => {
    mapInstanceRef.current?.destroy();
  };
}, []);
```

**覆盖物管理策略：**

| 覆盖物 | 创建方式 | 更新方式 |
|--------|---------|---------|
| 标记点 (Marker) | `new AMap.Marker({ position, title })` | 清除旧标记 → 创建新标记 → 添加到地图 |
| 轨迹线 (Polyline) | `new AMap.Polyline({ path, strokeColor })` | 同上 |
| 信息窗 (InfoWindow) | `new AMap.InfoWindow({ content })` | 点击标记时打开，点击地图其他区域关闭 |

所有覆盖物通过 `map.add()` / `map.remove()` / `map.clearMap()` 管理，在 React 组件中通过 `useEffect` 监听 `currentRoute` 变化来同步更新。

---

## 5. 页面设计

### 5.1 页面清单

| 页面 | 路径 | 描述 |
|------|------|------|
| 首页 | `/` | 展示预置路线卡片，导航入口 |
| 地图页 | `/map` | 核心功能页，全屏地图 + 侧边栏 |
| 地图页（带路线） | `/map?route={id}` | 加载特定路线 |
| 调试页 | `/debug` | 坐标 JSON 输入调试 |

### 5.2 首页（`/`）

```
┌─────────────────────────────────────────┐
│  Periplus  Logo        [创建新路线]     │  Header
├─────────────────────────────────────────┤
│                                         │
│   ┌─────────────┐                      │
│   │  🗺️ 丝绸之路  │  ← 预置路线卡片      │
│   │  7个地点     │                      │
│   │  [查看路线]  │                      │
│   └─────────────┘                      │
│                                         │
│   [ + 创建空白路线 ]                    │
│                                         │
├─────────────────────────────────────────┤
│  已保存的路线                           │
│  ┌─────────────┐ ┌─────────────┐      │
│  │ 我的西南之旅 │ │ 沿海自驾游  │ ...  │
│  └─────────────┘ └─────────────┘      │
│                                         │
└─────────────────────────────────────────┘
```

### 5.3 地图页（`/map`）

```
┌────────────────────────────────────────────────────────────┐
│  [← 返回]  路线名称  [保存] [底图切换] [缩放]          │  Top Bar
├──────────┬─────────────────────────────────────────────────┤
│          │                                                 │
│  地点列表  │                                                 │
│  ┌──────┐│                                                 │
│  │ 1.西安││                                                 │
│  │ 2.兰州││              地  图  视  图                    │
│  │ 3.张掖││                                                 │
│  │ ...  ││         ●─────●─────●─────●                     │
│  └──────┘│              轨迹线（Polyline）                    │
│          │         ↑ 标记点（Marker）                       │
│  [+ 添加]│                                                 │
│  [编辑]  │                                                 │
│  [删除]  │                                                 │
│          │                                                 │
└──────────┴─────────────────────────────────────────────────┘
     侧边栏 (300px)              地图主区域 (flex: 1)
```

### 5.4 调试页（`/debug`）

```
┌─────────────────────────────────────────┐
│  坐标调试工具                            │
├─────────────────────────────────────────┤
│  输入 JSON 坐标数组：                     │
│  ┌─────────────────────────────────┐    │
│  │ [                               │    │
│  │   {"name":"A","lat":x,"lng":y}, │    │
│  │   {"name":"B","lat":x,"lng":y}  │    │
│  │ ]                               │    │
│  └─────────────────────────────────┘    │
│  [ 绘制轨迹 ]  [ 清空 ]                  │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │                                 │    │
│  │        地图预览区域              │    │
│  │                                 │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

---

## 6. 组件设计

### 6.1 组件清单

| 组件 | 路径 | 职责 |
|------|------|------|
| MapContainer | `components/map/MapContainer.tsx` | 高德地图初始化、容器管理 |
| RoutePolyline | `components/map/RoutePolyline.tsx` | 轨迹线绘制、样式控制 |
| RouteMarkers | `components/map/RouteMarkers.tsx` | 标记点渲染、点击交互 |
| RouteEditor | `components/sidebar/RouteEditor.tsx` | 侧边栏路线编辑主组件 |
| PointList | `components/sidebar/PointList.tsx` | 轨迹点列表、拖拽排序 |
| PointForm | `components/sidebar/PointForm.tsx` | 添加/编辑地点表单 |
| RouteCard | `components/RouteCard.tsx` | 首页路线卡片 |
| DebugPanel | `components/debug/DebugPanel.tsx` | 调试页 JSON 输入面板 |

### 6.2 状态管理（Zustand）

```typescript
// stores/mapStore.ts
interface MapState {
  // 当前地图实例
  map: AMap.Map | null;
  setMap: (map: AMap.Map) => void;
  
  // 当前路线
  currentRoute: Route | null;
  setCurrentRoute: (route: Route | null) => void;
  
  // 选中的标记点
  selectedPoint: RoutePoint | null;
  setSelectedPoint: (point: RoutePoint | null) => void;
  
  // 底图类型
  mapType: 'standard' | 'satellite' | 'terrain';
  setMapType: (type: MapType) => void;
}
```

---

## 7. API 设计

### 7.1 路线 API

```
GET    /api/routes          → 获取所有路线列表
GET    /api/routes/:id      → 获取单个路线详情
POST   /api/routes          → 创建新路线
PUT    /api/routes/:id      → 更新路线
DELETE /api/routes/:id      → 删除路线
```

### 7.2 Mock AI API

```
GET /api/mock/plan?query=... → 返回预设的丝绸之路数据（忽略 query 参数）
```

响应示例：
```json
{
  "success": true,
  "data": {
    "name": "丝绸之路",
    "description": "从长安出发，经河西走廊至西域的经典路线",
    "points": [...]
  }
}
```

---

## 8. 数据库设计（Prisma Schema）

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Route {
  id          String   @id @default(uuid())
  name        String
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  points      RoutePoint[]
}

model RoutePoint {
  id        String  @id @default(uuid())
  routeId   String
  route     Route   @relation(fields: [routeId], references: [id], onDelete: Cascade)
  name      String
  lat       Float
  lng       Float
  order     Int
  stayDays  Int?
  notes     String?

  @@index([routeId])
}
```

---

## 9. 开发计划（v0.1.0）

### Phase 1: 项目搭建（1-2 天）
- [ ] 初始化 Next.js + TypeScript 项目
- [ ] 配置 Tailwind CSS + shadcn/ui
- [ ] 配置 Prisma + SQLite
- [ ] 配置高德地图 JS API

### Phase 2: 核心地图功能（2-3 天）
- [ ] MapContainer 组件（地图初始化）
- [ ] RoutePolyline 组件（轨迹线绘制）
- [ ] RouteMarkers 组件（标记点渲染）
- [ ] 底图切换功能
- [ ] 自动适配视野

### Phase 3: 路线管理（2-3 天）
- [ ] 路线 CRUD API
- [ ] RouteEditor 侧边栏
- [ ] PointList 拖拽排序
- [ ] PointForm 添加/编辑表单
- [ ] 首页路线列表

### Phase 4: 预设与调试（1-2 天）
- [ ] 丝绸之路预设数据
- [ ] Mock AI API
- [ ] Debug 页面（JSON 输入）

### Phase 5: 测试与优化（1-2 天）
- [ ] 单元测试（Vitest）
- [ ] E2E 测试（Playwright）
- [ ] 性能优化
- [ ] 代码审查

**预计总工期：7-12 天**

---

## 10. 风险与应对

| 风险 | 影响 | 应对 |
|------|------|------|
| 高德地图 API 申请延迟 | 中 | 先使用临时 Key 开发，后续替换 |
| 高德地图坐标偏移（GCJ-02） | 低 | 所有坐标统一使用 GCJ-02，无需转换 |
| 性能问题（大量标记点） | 低 | v0.1.0 路线点数量少，后续考虑聚合 |
| 跨域问题 | 低 | 高德地图支持 JSONP，Next.js 可配置 CORS |

---

## 11. 附录

### 11.1 命名规范

- 项目名：`periplus`
- 数据库表：PascalCase（Route, RoutePoint）
- API 端点：kebab-case（/api/routes）
- 组件：PascalCase（MapContainer）
- 工具函数：camelCase（formatCoordinate）

### 11.2 坐标系说明

- 中国地图使用 **GCJ-02（火星坐标系）**
- 高德地图原生使用 GCJ-02，无需额外转换
- 所有存储的坐标均为 GCJ-02

### 11.3 参考资源

- [高德地图 JS API 文档](https://lbs.amap.com/api/jsapi-v2/summary)
- [Next.js App Router 文档](https://nextjs.org/docs/app)
- [Prisma 文档](https://www.prisma.io/docs)
- [shadcn/ui 文档](https://ui.shadcn.com)

---

*文档结束。请审阅后提出修改意见，确认后进入实现计划阶段。*
