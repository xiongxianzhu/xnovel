<div align="center">

# xnovel

面向短篇到长篇创作的开源小说工作室，以作者为中心，并支持可插拔 AI 大模型。

[![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=20232A&style=for-the-badge)](https://react.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.138%2B-009688?logo=fastapi&logoColor=white&style=for-the-badge)](https://fastapi.tiangolo.com/)
[![Electron](https://img.shields.io/badge/Electron-planned-47848F?logo=electron&logoColor=white&style=for-the-badge)](https://www.electronjs.org/)
[![License](https://img.shields.io/badge/License-MIT-22C55E?style=for-the-badge)](./LICENSE)

</div>

xnovel 统一管理灵感、故事大纲、人物与世界设定、正文草稿和 AI 辅助流程。项目采用 Monorepo：Web 通过本地账号、FastAPI 和 PostgreSQL 提供登录后的云端工作区；Electron 将复用前端能力，并通过本地 SQLite 提供无需登录的离线工作区。

> **当前状态**：早期可用版本。Web 已覆盖写作、规划、AI Provider 与私有 Skill；Desktop 已覆盖离线写作、本地 Skill、加密 Provider 凭据、备份恢复与安装包配置。

## 项目方向

- 支持短篇、中篇与长篇小说，不以“章节数量”限制作品结构。
- 让作者掌控内容，AI 只提供构思、分析、改写和校对等辅助能力。
- 通过平台侧 Provider 适配层接入模型：Web 由 FastAPI 调用，Desktop 由 Electron 主进程调用。
- 让网页端与桌面端复用稳定的编辑器和领域能力，同时隔离云端与本地持久化。
- Web 支持三种界面语言、跨端主题预设和用户私有 Skill 管理；Desktop 只读使用 `~/.agents/skills/` 中的本地 Skill。
- Skill 只作为用户明确选择的不可信 AI 上下文，任何端都不执行其中的脚本、二进制或安装命令。

## 仓库结构

```text
xnovel/
├─ apps/
│  ├─ api/                 # FastAPI 后端
│  ├─ web/                 # Vite + React 网页端
│  └─ desktop/             # Electron + SQLite 离线桌面端
├─ packages/               # Web/Desktop 稳定共享包（当前含主题契约）
├─ docs/                   # 产品、架构、接口与交付文档
├─ scripts/                # 构建、发布和开发脚本
└─ .github/                # GitHub 工作流与仓库配置
```

## 核心文档

| 文档                                               | 用途                                 |
| -------------------------------------------------- | ------------------------------------ |
| [`docs/prd.md`](docs/prd.md)                       | 定义产品目标、首版范围与验收标准     |
| [`docs/architecture.md`](docs/architecture.md)     | 说明系统边界、数据流和 Monorepo 结构 |
| [`docs/database.md`](docs/database.md)             | 定义 PostgreSQL 与 SQLite 数据边界   |
| [`docs/tech-stack.md`](docs/tech-stack.md)         | 记录已采用的技术栈与版本策略         |
| [`docs/api.md`](docs/api.md)                       | 记录当前 FastAPI 契约与错误格式      |
| [`docs/ai-integration.md`](docs/ai-integration.md) | 定义 AI Provider、安全和上下文边界   |
| [`docs/deployment.md`](docs/deployment.md)         | 说明本地运行、发布和回滚基线         |
| [`docs/tasks.md`](docs/tasks.md)                   | 跟踪分阶段实施任务与完成条件         |

## 快速开始

### 启动后端

需要 Python 3.14+、[uv](https://docs.astral.sh/uv/) 和可用的 PostgreSQL。

```bash
cd apps/api
uv sync
cp .env.example .env
```

确认 PostgreSQL 服务已经启动。使用非超级用户 `xnovel_app`，设置强密码后创建由该用户拥有的开发数据库：

```bash
psql -U postgres
```

在 `psql` 中执行以下 SQL。请将占位符替换为随机生成的强密码，不要提交真实密码：

```sql
CREATE USER xnovel_app WITH PASSWORD 'CHANGE_TO_A_STRONG_PASSWORD';
CREATE DATABASE xnovel OWNER xnovel_app;
GRANT ALL PRIVILEGES ON DATABASE xnovel TO xnovel_app;
```

如果用户或数据库已经存在，跳过对应创建语句。编辑 `.env`，使用刚设置的密码：

```dotenv
DATABASE_URL=postgresql+asyncpg://xnovel_app:YOUR_PASSWORD@localhost:5432/xnovel
```

密码包含特殊字符时，需要先进行 URL 编码。开发、正式与示例环境的数据库名固定为 `xnovel`；持续集成单独使用 `xnovel_test`。

```bash
uv run alembic upgrade head
uv run fastapi dev
```

首次迁移完成后创建默认管理员：

```bash
uv run python -m app.cli create-admin
# Output: Administrator created. Change the password after the first login.
```

默认账号为 `admin`，昵称为“管理员”，邮箱和手机号为空。初始化密码为一次性引导密码 `123456`，首次登录后必须设置新密码。

启动成功后：

```text
API:     http://127.0.0.1:8000
OpenAPI: http://127.0.0.1:8000/docs
Health:  http://127.0.0.1:8000/api/v1/health
```

### 启动网页端

需要 Node.js 24+ 和 pnpm 11+。

```bash
cd apps/web
pnpm install
cp .env.example .env
pnpm dev
```

输出：

```text
Local: http://127.0.0.1:5173
```

### 验证网页端

```bash
cd apps/web
pnpm check
pnpm build
```

### 启动与验证桌面端

桌面端无需 API、PostgreSQL 或登录。需要 Node.js 24.18+ 和 pnpm 11+：

```bash
cd apps/desktop
pnpm install
pnpm dev
```

本地数据保存在 Electron `userData` 目录。提交前执行：

```bash
pnpm check
pnpm build
pnpm pack:dir
```

Windows x64 安装包使用 `pnpm dist:win`；macOS x64 / arm64 分别使用 `pnpm dist:mac:x64` 与 `pnpm dist:mac:arm64`。签名、公证和 GitHub Release 由 Tag 发布工作流注入 Secret，仓库不保存证书或密码。

## 参与开发

开始实现功能前，先阅读 [贡献指南](CONTRIBUTING.md) 和 [文档导航](docs/README.md)。报告问题或提出功能建议时，使用结构化的 [GitHub Issue 表单](https://github.com/xiongxianzhu/xnovel/issues/new/choose)。

修改产品范围、API、AI 数据边界或部署方式时，同步更新对应文档。Pull Request 会通过 GitHub Actions 自动验证 API、Web 与 Desktop。

## 许可

xnovel 使用 [MIT License](LICENSE)。
