# Periplus - Agent Instructions

> 旅行轨迹规划平台 - 面向开发者的协作指南

---

## 1. 项目阶段声明

**当前处于初期开发迭代阶段。**

- **不考虑向后兼容** — API、数据结构、接口随时可能重构，无需保留废弃代码或兼容性层
- **不考虑迁移策略** — 数据库 schema 变更直接改，不维护旧版本数据迁移
- **快速验证优先** — 功能先跑通再优化，不要过度设计
- **随时可能推翻重来** — 如果某个方案被证明不合适，直接重写，不要修补

---

## 2. 代码规范

### 2.1 注释规则

**注释和实现写在一处，不要拆分。**

- ✅ 正确：
  ```typescript
  // 高德地图使用 GCJ-02 坐标系，所有坐标直接按此存储
  const path = points.map((p) => new AMap.LngLat(p.lng, p.lat));
  ```

- ❌ 错误（不要单独写注释文件或注释块）：
  ```typescript
  // 见 docs/coordinate-system.md 了解坐标系说明
  const path = points.map((p) => new AMap.LngLat(p.lng, p.lat));
  ```

- **禁止创建独立的注释/说明文档来阐述代码逻辑** — 代码本身 + 行内注释就是全部文档
- **复杂逻辑必须在代码旁立即解释**，不要让读者跳转到别处查看

### 2.2 其他规范

- 遵循现有代码风格（TypeScript 严格模式、Tailwind CSS、shadcn/ui 组件）
- 每个文件一个明确职责，保持小而聚焦
- 使用 Zustand 进行客户端状态管理
- 地图相关操作通过 `lib/amap.ts` 统一加载 AMap SDK

---

## 3. 提交规则

### 3.1 docs/superpowers 目录

**docs/superpowers/ 目录下的文件不提交到 Git。**

- 该目录已从 Git 跟踪中移除，并加入 `.gitignore`
- 设计文档、实现计划等文件保留在本地工作区，不进入版本控制
- 如果后续需要提交 docs 目录下的其他文件，**必须经用户明确同意**

### 3.2 提交前检查

```bash
npm run typecheck   # TypeScript 类型检查
npm run test        # 单元测试
npm run build       # 生产构建
```

三项全部通过后再提交。

---

## 4. 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 15 (App Router) |
| 语言 | TypeScript 5 (严格模式) |
| 样式 | Tailwind CSS 4 + shadcn/ui |
| 地图 | 高德地图 JS API 2.0 |
| 数据库 | SQLite (开发) |
| ORM | Prisma |
| 状态 | Zustand |
| 测试 | Vitest + Playwright |

---

## 5. 高德地图 Key 配置

在 `.env.local` 中设置：

```
NEXT_PUBLIC_AMAP_KEY=你的高德Key
```

**注意**：
- 变量名必须是 `NEXT_PUBLIC_AMAP_KEY`（Next.js 浏览器端环境变量要求）
- 申请 Key 后需在高德控制台白名单中添加 `localhost:3000`
- `.env.local` 文件已被 `.gitignore` 忽略，不会意外提交

---

*本文件如有变更，直接提交，无需用户额外同意。*
