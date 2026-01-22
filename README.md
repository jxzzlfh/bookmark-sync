# 星痕导航 (Bookmark Sync)

浏览器书签云端同步系统 - 将本地书签同步到云端，以精美的导航网站形式展示。

## ✨ 功能特性

- **单向同步** - 浏览器书签 → 云端，浏览器为唯一数据源
- **实时监听** - 本地书签增删改移动，自动同步到服务器
- **智能同步** - 定时增量同步（15分钟）+ 手动全量同步，大量书签时性能更优
- **精美导航** - 导航网站按目录结构展示书签，支持亮色/暗色/自动主题
- **全局搜索** - 快捷键 `Ctrl+0` 快速搜索所有书签
- **自托管** - 数据完全自主掌控，支持 Docker 一键部署

---

## 🏗️ 技术架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              星痕导航 系统架构                                │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌───────────────────┐                      ┌───────────────────┐
    │   Chrome 浏览器    │                      │   导航网站 (Web)   │
    │  ┌─────────────┐  │                      │  ┌─────────────┐  │
    │  │  书签管理器  │  │                      │  │  书签展示   │  │
    │  │  (本地书签)  │  │                      │  │  全局搜索   │  │
    │  └──────┬──────┘  │                      │  │  主题切换   │  │
    │         │         │                      │  └──────┬──────┘  │
    │  ┌──────▼──────┐  │                      │         │         │
    │  │ 浏览器扩展   │  │                      └─────────┼─────────┘
    │  │ (Manifest V3)│  │                                │
    │  │             │  │    HTTPS REST API              │
    │  │ • 书签监听  │  │◄────────────────────►┌─────────▼─────────┐
    │  │ • 全量同步  │  │                      │    同步服务器      │
    │  │ • 实时推送  │  │                      │   (Node.js)       │
    │  │ • 定时任务  │  │                      │  ┌─────────────┐  │
    │  └─────────────┘  │                      │  │ Express API │  │
    └───────────────────┘                      │  │  • 认证     │  │
                                               │  │  • CRUD     │  │
           ▲                                   │  │  • 搜索     │  │
           │ chrome.bookmarks API              │  └──────┬──────┘  │
           │                                   │         │         │
    ┌──────┴──────┐                            │  ┌──────▼──────┐  │
    │  书签事件    │                            │  │   SQLite    │  │
    │ • onCreated │                            │  │  (sql.js)   │  │
    │ • onChanged │                            │  └─────────────┘  │
    │ • onRemoved │                            └───────────────────┘
    │ • onMoved   │
    └─────────────┘
```

### 同步流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           同步流程示意图                                  │
└─────────────────────────────────────────────────────────────────────────┘

  浏览器扩展                                              服务器
      │                                                    │
      │  ─────────── 1. 用户点击"立即同步" ───────────►    │
      │                                                    │
      │  ◄──────────── 2. POST /api/bookmarks/clear ────── │
      │                    (清空服务器数据)                  │
      │                                                    │
      │  ─────────── 3. 获取本地书签树 ──────────►         │
      │              chrome.bookmarks.getTree()            │
      │                                                    │
      │  ─────────── 4. 按深度排序，父节点优先 ──────────►  │
      │                                                    │
      │  ─────────── 5. 批量上传书签/文件夹 ──────────►    │
      │              POST /api/bookmarks/batch             │
      │              (每批50条，建立 localId ↔ remoteId 映射) │
      │                                                    │
      │  ◄──────────── 6. 返回创建的书签信息 ─────────────  │
      │                                                    │
      │  ─────────── 7. 同步完成，保存时间戳 ──────────►   │
      │                                                    │

  ═══════════════════════ 实时监听 ═══════════════════════════

      │  onCreated ──► POST /api/bookmarks                 │
      │  onChanged ──► PUT /api/bookmarks/:id              │
      │  onRemoved ──► DELETE /api/bookmarks/:id           │
      │  onMoved   ──► PUT /api/bookmarks/:id/move         │
```

---

## 🤖 Cursor Agent Skills

本项目使用 **Cursor Agent Skills** 辅助开发，Skills 是可复用的 AI 开发指南，帮助 AI 理解项目特定领域的知识和最佳实践。

### 使用的 Skills

| Skill | 路径 | 作用 |
|-------|------|------|
| `browser-extension-builder` | `.cursor/skills/browser-extension-builder/` | 浏览器扩展开发指导 |
| `bookmark-sync-service` | `.cursor/skills/bookmark-sync-service/` | 同步服务开发指导 |

### 1. browser-extension-builder Skill

**作用**：指导 AI 构建 Chrome Manifest V3 浏览器扩展

**包含内容**：
- Service Worker 生命周期管理（30秒超时、5分钟执行限制）
- `chrome.bookmarks` API 完整用法（监听、读取、修改）
- `chrome.storage` 本地存储使用
- WebSocket 在 Service Worker 中的保活机制
- Vite 构建配置
- 跨浏览器兼容性（Chrome/Firefox）

**参考文档**：
- `reference/manifest-v3-guide.md` - Manifest V3 完整指南
- `reference/websocket-keepalive.md` - WebSocket 保活模式

**在本项目中的应用**：
```typescript
// 基于 Skill 指导实现的书签监听
chrome.bookmarks.onCreated.addListener(onBookmarkCreated);
chrome.bookmarks.onChanged.addListener(onBookmarkChanged);
chrome.bookmarks.onRemoved.addListener(onBookmarkRemoved);
chrome.bookmarks.onMoved.addListener(onBookmarkMoved);

// 基于 Skill 指导的定时任务（避免 setInterval）
chrome.alarms.create('periodic-sync', { periodInMinutes: 15 });
```

### 2. bookmark-sync-service Skill

**作用**：指导 AI 构建书签同步后端服务

**包含内容**：
- 数据模型设计（Bookmark、SyncEvent、User）
- 同步协议规范（全量同步、增量同步、冲突解决）
- REST API 设计
- SQLite 数据库 Schema
- WebSocket 实时通信
- 乐观锁冲突处理
- 部署方案（自托管、Vercel、Cloudflare）

**参考文档**：
- `reference/sync-protocol.md` - 同步协议详细规范
- `reference/conflict-resolution.md` - 冲突解决策略

**在本项目中的应用**：
```typescript
// 基于 Skill 定义的数据模型
interface Bookmark {
  id: string;
  userId: string;
  parentId: string | null;
  title: string;
  url: string | null;
  isFolder: boolean;
  sortOrder: number;
  syncVersion: number;
  // ...
}

// 基于 Skill 设计的 API 端点
app.use('/api/auth', authRouter);      // 认证
app.use('/api/bookmarks', bookmarksRouter);  // 书签 CRUD
```

### 如何使用 Skills

1. **在 Cursor 中开发**：Skills 会自动被 AI 识别和使用
2. **手动参考**：阅读 `.cursor/skills/*/SKILL.md` 和 `reference/` 目录

### 创建自定义 Skill

```
.cursor/skills/your-skill/
├── SKILL.md           # 主文件，包含核心指导
└── reference/         # 参考文档
    ├── api-guide.md
    └── examples.md
```

---

## 📁 项目结构

```
bookmark-sync/
├── .cursor/skills/           # Cursor Agent Skills
│   ├── browser-extension-builder/
│   │   ├── SKILL.md
│   │   └── reference/
│   └── bookmark-sync-service/
│       ├── SKILL.md
│       └── reference/
├── extension/                # 浏览器扩展
│   ├── src/
│   │   ├── background/       # Service Worker
│   │   ├── popup/            # 弹窗界面
│   │   └── utils/            # 工具函数
│   └── manifest.json
├── web/                      # 导航网站 (Next.js 14)
│   ├── src/
│   │   ├── app/              # App Router
│   │   ├── components/       # React 组件
│   │   └── hooks/            # 自定义 Hooks
│   └── public/               # 静态资源
├── server/                   # 后端服务
│   ├── src/
│   │   ├── routes/           # API 路由
│   │   └── db/               # 数据库操作
│   └── Dockerfile
├── packages/shared/          # 共享类型定义
├── docker-compose.yml
└── nginx/                    # Nginx 配置
```

---

## 🚀 快速开始

### 环境要求

- Node.js >= 18.0.0
- pnpm >= 8.0.0

### 本地开发

```bash
# 安装依赖
pnpm install

# 启动所有服务
pnpm dev

# 或分别启动
pnpm dev:server    # 后端 http://localhost:3000
pnpm dev:web       # 前端 http://localhost:3001
pnpm dev:extension # 扩展 (watch mode)
```

### 构建

```bash
pnpm build           # 构建全部
pnpm build:extension # 仅构建扩展
```

---

## 🔌 浏览器扩展

### 安装步骤

1. `pnpm build:extension`
2. 打开 `chrome://extensions`
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 `extension/dist` 目录

### 配置说明

| 配置项 | 说明 |
|--------|------|
| API服务器地址 | 后端 API 地址，如 `https://api.example.com` |
| 导航网站地址 | 前端网站地址，如 `https://nav.example.com` |

---

## 🐳 Docker 部署

```bash
# 1. 配置环境变量
cp .env.example .env
# 编辑 .env 设置 JWT_SECRET 和 NEXT_PUBLIC_API_URL

# 2. 构建并启动
docker-compose build
docker-compose up -d

# 3. 查看日志
docker-compose logs -f
```

---

## 🔧 技术栈

| 组件 | 技术 |
|------|------|
| 浏览器扩展 | Chrome Extension Manifest V3, React, TypeScript, Vite |
| 导航网站 | Next.js 14, React 18, Tailwind CSS, Fuse.js |
| 后端服务 | Node.js, Express, sql.js (SQLite), JWT |
| 数据库 | SQLite (sql.js 纯 JS 实现) |

---

## 📝 更新日志

### v1.0.1 (2026-01-22)

**修复与优化**：
- 🐛 修复 Service Worker 休眠后登录状态丢失的问题
  - 每次唤醒时自动从 storage 恢复认证状态和 ID 映射
- ⚡ 优化书签同步性能
  - 新增批量上传 API (`/api/bookmarks/batch`)，每批 50 条
  - 大量书签时同步速度显著提升
- ⏰ 定时同步间隔调整为 15 分钟（原 5 分钟）
- 🔄 智能同步策略
  - 定时同步：增量同步（仅同步新增书签）
  - 手动同步：全量同步（清空重建）
- 💾 ID 映射持久化到 storage，避免重复上传

### v1.0.0 (2026-01-21)

- 单向同步：浏览器 → 服务器
- 导航网站首页直接展示书签栏内容
- 书签在上、文件夹在下的展示顺序
- 隐藏"其他书签"文件夹
- 支持亮色/暗色/自动主题切换
- Docker Compose 一键部署
- 扩展支持 API 连接测试
- Cursor Agent Skills 辅助开发

---

## 📄 License

MIT
