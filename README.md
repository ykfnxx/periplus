# Periplus

[简体中文](./README.md) · [English](./README.en.md)

Periplus 是以地图和照片为入口的游记应用。每份旅程只有一条有序事件链，文字、照片、账单和地点直接属于事件；未填写的日期、时间和地点可以留空。

## 核心能力

- 在地图上浏览照片、选择地点，阅读和编辑连续游记。
- 添加、修改、移动记录，保留每张照片的说明和独立位置。
- 用本地 PaddleOCR 识别账单，修改确认后将字段和原图附到事件。
- 邀请朋友共写，分别保留事件作者和附件上传者；作者可整理全篇，朋友编辑自己的内容。
- 通过 PostgreSQL 保存旅程和修订，使用版本检查避免覆盖并发修改，重复请求可安全重放。
- 通过 OpenDAL 对接私有 S3 兼容存储，资源读取逐次校验权限。

## 环境与启动

使用 Node.js 22、PostgreSQL 15+ 和私有 S3 兼容存储桶。地图需要高德 JS API Key；地点库导入、补全脚本使用高德 Web Service Key。

```bash
npm ci
cp .env.example .env.local
```

在 `.env.local` 填写数据库、认证、存储和地图配置。浏览器只读取 `NEXT_PUBLIC_*`；私有配置通过 `config/periplus.server.ts` 读取。隔离开发和测试可使用 `PERIPLUS_STORAGE_SCHEME="fs"` 或进程内的 `"memory"`。

在全新的开发数据库初始化：

```bash
npx prisma generate
npx prisma migrate deploy
npm run db:seed
```

Seed 只接受空数据库。Schema 变更直接更新开发基线，不提供旧数据兼容或迁移。

完整应用只在开发服务器运行，调试前连接 Monitor。Mac 仅运行独立 Storybook 或测试。

```bash
npm run dev
```

Web 和产品 API 共用 Next.js，默认端口 3001。Storybook 默认端口 6006。

## 账单识别与共写

账单原图经 OpenDAL 读取后传给本地 PaddleOCR。Linux 的独立 Python 3.11 环境安装 `ops/ocr/requirements.txt` 后运行 `ops/ocr/start.sh`；首次启动需要下载模型，默认监听 `127.0.0.1:8106`。Web 配置 `PERIPLUS_OCR_URL=http://127.0.0.1:8106/ocr`，需要调整端口时同步设置 OCR 的 `PERIPLUS_OCR_PORT`。

识别结果需要用户确认，缺失字段可手动填写。邀请链接默认七天有效，作者可查看和撤销；朋友登录接受后可添加事件、照片和账单。共写不开放成员未共享的素材库。

## 资源 API

`POST /api/assets` 接受二进制流，`Content-Type` 指定 MIME，`X-Upload-Id` 是同一用户重试时保持稳定的幂等键；可选的 `X-File-Name` 使用 URL 编码。返回资源 ID、类型、大小和同源文件 URL。`/api/assets/:id/file` 校验权限并支持单段字节 Range。资源删除为软删除，当前事件引用会阻止删除。

## 常用命令

| 命令                           | 用途             |
| ------------------------------ | ---------------- |
| `npm run dev`                  | 启动 Next.js     |
| `npm run build` / `npm start`  | 构建／运行生产版 |
| `npm run storybook`            | 独立组件开发     |
| `npm run typecheck`            | TypeScript 检查  |
| `npm run test:unit -- --run`   | 单元测试         |
| `npm run places:import-mct-5a` | 导入地点目录     |
| `npm run places:enrich-mct-5a` | 补全地点资料     |

## 项目结构

```text
app/                    Next.js 页面和产品 API
modules/                认证、数据、游记和地图组件
lib/                    地图、坐标和地点工具
ops/ocr/                本地 PaddleOCR 配置
prisma/                 Schema、开发基线和 Seed
scripts/                地点目录维护
tests/                 单元、Storybook 和浏览器测试
```

技术栈：Next.js 16、React 19、TypeScript、Tailwind CSS 4、Kumo、Zustand、Prisma、Better Auth、OpenDAL、Vitest、Storybook 和 Playwright。

## License

[MIT](./LICENSE) © 2026 ykfnxx
