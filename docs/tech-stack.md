# xnovel 技术栈

> 状态：Active  
> 版本核实日期：2026-08-16

本文分别记录 API、Web 和 Desktop 的技术栈。表中的“已锁定”以仓库锁文件为准；“规划基线”用于尚未创建的桌面工程，落地时必须重新核对稳定版和兼容性。

## 1. 版本与平台原则

- 只采用 stable / LTS 版本，不使用 alpha、beta、rc 或 nightly。
- API 以 apps/api/uv.lock 为可复现安装来源，Web 以 apps/web/pnpm-lock.yaml 为准。
- 未落地的 Desktop 版本采用 2026-08-15 的最新稳定版，但不代表依赖已经安装。
- 主版本升级必须单独验证类型检查、测试、构建、安装包和自动更新。
- 生产数据库跟随 PostgreSQL 当前受支持的最新大版本，并及时升级该大版本的补丁版本。

### 默认支持平台

| 客户端  | 操作系统             | 架构        | 发布目标    |
| ------- | -------------------- | ----------- | ----------- |
| Web     | 现代桌面浏览器       | x64 / arm64 | 静态资源    |
| Desktop | Windows 10 / 11      | x64         | NSIS 安装包 |
| Desktop | macOS 当前受支持版本 | x64         | DMG + ZIP   |
| Desktop | macOS 当前受支持版本 | arm64       | DMG + ZIP   |

首版不发布 Windows arm64、Windows 32 位或 Linux 桌面包。“mac 64 位”同时指 Intel x64 与 Apple Silicon arm64，不制作通用 Universal 包，避免安装包体积翻倍；两个架构分别构建、签名和发布。

## 2. API 技术栈

### 运行时与业务依赖

| 类别         | 技术              | 当前基线 | 状态     | 用途                         |
| ------------ | ----------------- | -------- | -------- | ---------------------------- |
| 语言与运行时 | Python            | 3.14.6   | 已验证   | API 运行时                   |
| 包管理       | uv                | 0.11.26  | 已验证   | 虚拟环境、锁定依赖与命令执行 |
| Web 框架     | FastAPI           | 0.141.1  | 已锁定   | REST API 与 OpenAPI          |
| ASGI Server  | Uvicorn           | 0.52.3   | 已锁定   | 开发和生产进程入口           |
| 配置         | Pydantic Settings | 2.15.0   | 已锁定   | 环境变量解析与校验           |
| ORM          | SQLModel          | 0.0.39   | 已锁定   | 领域模型与 SQLAlchemy 集成   |
| 数据库       | PostgreSQL        | 18.6     | 部署基线 | 业务数据持久化               |
| 异步驱动     | asyncpg           | 0.31.0   | 已锁定   | PostgreSQL 异步连接          |
| 迁移         | Alembic           | 1.19.1   | 已锁定   | 数据库结构迁移               |
| 模板         | Jinja2            | 3.1.6    | 已锁定   | 服务端模板能力               |
| 环境文件     | python-dotenv     | 1.2.2    | 已锁定   | 本地环境变量加载             |
| 异步桥接     | greenlet          | 3.5.5    | 已锁定   | SQLAlchemy 异步上下文支持    |
| 密码哈希     | pwdlib[argon2]    | 0.3.1    | 已锁定   | Argon2id 密码哈希与校验      |
| 邮箱校验     | email-validator   | 2.3.0    | 已锁定   | 邮箱语法与规范化校验         |
| 手机号       | phonenumbers      | 9.0.37   | 已锁定   | 完整 E.164 解析与有效性校验  |
| 图片处理     | Pillow            | 12.3.0   | 规划基线 | 头像与 Logo 类型和像素校验   |
| YAML         | PyYAML            | 6.0.3    | 规划基线 | 安全解析 Skill frontmatter   |

Pillow 与 PyYAML 仍是规划依赖，尚未写入 `pyproject.toml` 或 `uv.lock`。实现媒体或 Skill 纵向切片时，重新核对 Python 3.14 兼容性并通过 `uv add` 锁定；Skill ZIP 使用 Python 标准库 `zipfile` 配合自定义路径、条目类型、累计大小和碰撞校验，不能直接信任 `extractall()`。

Web AI 已确定使用 AES-256-GCM 凭据加密和四种 Provider HTTP 协议，但运行时加密库与异步 HTTP 客户端尚未选择或写入锁文件。T-401 实施时必须重新核对 Python 3.14 兼容的最新稳定版，通过 `uv add` 锁定，并分别验证流式取消、连接目标校验、禁止重定向和 AES-GCM 测试向量。当前开发依赖中的 HTTPX 只承担 ASGI/API 测试，不能据此描述为已选定的 Provider 运行时客户端。

数据模型、约束、索引和迁移规则见 [database.md](database.md)，接口契约见 [api.md](api.md)。

### 质量工具

| 类别           | 技术      | 当前基线 | 状态   | 用途                   |
| -------------- | --------- | -------- | ------ | ---------------------- |
| 格式与静态检查 | Ruff      | 0.16.3   | 已锁定 | 格式化、导入和代码质量 |
| 类型检查       | mypy      | 2.3.1    | 已锁定 | Python 静态类型检查    |
| 测试           | pytest    | 9.1.1    | 已锁定 | 单元与集成测试         |
| HTTP 测试      | HTTPX     | 0.28.1   | 已锁定 | ASGI / API 测试客户端  |
| 测试数据库驱动 | aiosqlite | 0.22.1   | 已锁定 | 隔离的异步数据库测试   |

## 3. Web 技术栈

### 运行时与业务依赖

| 类别              | 技术              | 当前基线 | 状态     | 用途                                 |
| ----------------- | ----------------- | -------- | -------- | ------------------------------------ |
| JavaScript 运行时 | Node.js           | 24.19.0+ | 仓库要求 | 本地开发与 CI；优先使用 Node 24 LTS  |
| 包管理            | pnpm              | 11.21.0  | 已声明   | Monorepo 依赖与锁文件                |
| UI 框架           | React / React DOM | 19.2.8   | 已锁定   | 网页界面                             |
| UI 组件库         | Ant Design        | 6.6.0    | 规划基线 | 工作台、表单、反馈与管理界面组件     |
| 类型系统          | TypeScript        | 6.0.3    | 已锁定   | strict 模式类型检查                  |
| 构建工具          | Vite              | 8.2.1    | 已锁定   | 开发服务器与生产构建                 |
| HTTP 客户端       | Axios             | 1.19.0   | 已锁定   | API 请求、Bearer 认证与统一错误适配  |
| Server State      | TanStack Query    | 5.101.4  | 已锁定   | 请求、缓存、失效和重试               |
| Schema            | Zod               | 4.4.3    | 已锁定   | 环境变量与不可信数据校验             |
| 国际化            | i18next           | 26.3.6   | 规划基线 | `zh-CN`、`zh-TW`、`en-US` 资源与回退 |
| React 国际化      | react-i18next     | 17.0.11  | 规划基线 | React 翻译 Hook 与 Provider          |

Ant Design 和国际化规划依赖尚未写入 `package.json` 或锁文件。实施时重新核对 React 19、构建工具与各依赖的兼容性，再使用 pnpm 锁定。Axios 已写入 Web 锁文件；生成的 API 客户端统一使用 Axios 传输层，不保留并行的 Fetch 请求封装。主题通过共享清单、CSS 自定义属性、Ant Design 主题配置和 `prefers-color-scheme` 实现；共享主题清单仍是 Web 与 Desktop 的跨端语义事实来源。

### 质量工具

| 类别      | 技术                     | 当前基线 | 状态   | 用途                               |
| --------- | ------------------------ | -------- | ------ | ---------------------------------- |
| 单元测试  | Vitest                   | 4.1.10   | 已锁定 | 单元和组件测试                     |
| DOM 环境  | jsdom                    | 30.0.1   | 已锁定 | 浏览器环境模拟                     |
| 组件测试  | Testing Library React    | 16.3.2   | 已锁定 | 面向用户行为的组件测试             |
| DOM 断言  | Testing Library jest-dom | 7.0.1    | 已锁定 | 可读的 DOM 断言                    |
| 静态检查  | ESLint                   | 10.8.1   | 已锁定 | TypeScript、React 与 Hooks 规则    |
| TS ESLint | typescript-eslint        | 8.67.0   | 已锁定 | TypeScript ESLint 解析与规则       |
| 格式化    | Prettier                 | 3.9.6    | 已锁定 | Markdown、JSON、CSS 与前端代码格式 |
| API 生成  | @hey-api/openapi-ts      | 0.99.0   | 已锁定 | 从 FastAPI OpenAPI 生成类型与 SDK  |

### 状态边界

| 状态             | 默认位置                         |
| ---------------- | -------------------------------- |
| 服务端数据       | TanStack Query                   |
| URL 可分享状态   | 路由层                           |
| 表单状态         | 表单组件或表单库                 |
| 局部交互状态     | React 组件                       |
| 跨页面客户端状态 | 只有出现真实需求后再引入 Zustand |

不得把服务端响应复制到另一个全局 Store。状态保留在离使用位置最近、且能正确恢复的边界。

## 4. Desktop 技术栈

apps/desktop 当前只有目录占位，以下版本均为规划基线。实施时应先创建独立 package.json 和锁文件，再把“规划基线”改为“已锁定”。

### 运行时、构建与发布

| 类别       | 技术                            | 规划基线        | 用途                                     |
| ---------- | ------------------------------- | --------------- | ---------------------------------------- |
| 桌面运行时 | Electron                        | 43.4.0          | 主进程、窗口、系统能力和 Chromium 运行时 |
| 桌面构建   | electron-vite                   | 5.0.0           | 分别构建 main、preload 和 renderer       |
| UI 与类型  | React 19.2.8 + TypeScript 6.0.3 | 与 Web 同步     | 复用网页端 UI、编辑器和领域能力          |
| 前端构建   | Vite                            | 7.3.6           | electron-vite 5 支持的最新稳定主线       |
| 打包发布   | electron-builder                | 26.15.7         | Windows / macOS 安装包、签名与发布元数据 |
| 自动更新   | electron-updater                | 6.8.9           | 检查、下载和安装已签名更新               |
| 受限桥接   | contextBridge + preload         | Electron 内置   | 只暴露经过校验的最小 IPC API             |
| 本地数据库 | SQLite                          | 3.x，实施时锁定 | 无需登录的本地业务数据持久化             |
| 凭据加密   | safeStorage                     | Electron 内置   | 使用操作系统密码学加解密本地凭据密文     |
| 本地文件   | Node.js 文件系统 API            | Electron 内置   | 封面、附件、导出文件和数据库备份         |

SQLite 驱动和迁移工具尚未选定。Desktop 工程落地时先验证 Electron ABI、Windows 与 macOS 打包、备份能力和事务行为，再锁定最新稳定兼容版本并提交锁文件。不得仅为了填写版本表提前声明未安装的 npm 包。

默认打包组合：

- Windows x64：NSIS。它与 electron-updater 的自动更新链路直接兼容。
- macOS x64、arm64：DMG 用于安装，同时生成 ZIP 供更新元数据使用。
- Windows 包在 Windows runner 构建；macOS 包在 macOS runner 构建并完成 Developer ID 签名与 Apple 公证。
- 应用版本使用 SemVer；撤回故障版本后只能发布更高版本号的修复包。

### Electron 安全基线

- renderer 默认 nodeIntegration: false、contextIsolation: true、sandbox: true。
- renderer 只加载随安装包发布的本地 React 资源；远程 API 必须使用 HTTPS。
- preload 通过 contextBridge 暴露白名单能力，不直接暴露 ipcRenderer、文件系统或 shell。
- 所有 IPC 校验调用方、频道名和输入 Schema；外部链接只允许可信协议与域名。
- 配置严格的 Content Security Policy，并限制导航、新窗口和权限请求。
- 自动更新只接受签名产物；密钥、签名证书和公证凭据只存放在 CI Secret。

### Desktop 数据边界

- Desktop 无需登录，基础写作和保存不依赖 FastAPI 或 PostgreSQL。
- SQLite 只由 Electron 主进程访问，并存放在 `app.getPath("userData")` 下。
- renderer 通过 preload 暴露的领域接口读写数据，不能获得数据库句柄、任意 SQL 或文件系统 API。
- SQLite 连接启用外键和 WAL；Schema 使用 Desktop 独立迁移链，不复用 Alembic。
- 本地 Skill 使用 Node.js 文件系统与 `crypto` 流式哈希，只读扫描 `~/.agents/skills/`；不引入执行器、安装器或通用任意文件 IPC。
- AI Provider 调用发生在主进程。主进程优先使用 `safeStorage` 异步 API 加解密；密文由应用保存在 `userData/credentials.v1.json`，SQLite 只保存非敏感配置和凭据引用。
- `safeStorage` 不负责持久化密文。Windows 下它不能防止同一登录用户空间中的其他应用解密，产品不能把它描述为独立凭据保险库。
- 封面、附件和导出文件使用受控本地目录；数据库保存相对路径和元数据。
- 应用更新前验证数据库迁移和备份恢复，安装包更新不能删除用户数据。

## 5. 默认不引入

- SSR 或 Next.js：当前应用以登录后的创作工作台为主。
- 微前端：当前没有独立团队和独立发布边界。
- Redux：当前状态规模尚未证明需要。
- 浏览器端或 renderer 内的模型 SDK：会暴露密钥并绕过服务端治理。
- FastAPI Desktop sidecar：本地写作直接使用主进程存储服务和 SQLite，不额外打包 Python 服务。
- renderer 直接访问 SQLite 或任意文件系统：会扩大攻击面并绕过 IPC 校验。
- Web 与 Desktop 自动同步：身份、冲突和删除传播尚未设计，不能把导入导出冒充同步。
- Electron Forge 8 alpha：未达到稳定版；当前桌面规划使用稳定的 electron-vite + electron-builder 组合。
- Desktop 不与 Web 强行共用 Vite 版本：electron-vite 5 的 peer dependency 只支持 Vite 5–7，Desktop 使用 Vite 7.3.6，Web 继续使用 Vite 8.2.1。
- 单一 macOS Universal 包：首版分别发布 x64 和 arm64，降低下载体积并简化问题定位。

## 6. 版本升级流程

1. 查看直接依赖的新稳定版本、运行时要求、peer dependency 与迁移说明。
2. 在独立变更中更新依赖声明和锁文件，不手工改写锁文件。
3. 执行对应应用的完整检查；Desktop 还必须安装并启动真实安装包。
4. Electron 主版本升级后复核安全清单、原生依赖 ABI、签名、公证与更新链路。
5. 将最终锁定版本和平台变化同步回本文及 [deployment.md](deployment.md)。

### pnpm 维护与国内镜像

升级 pnpm 后检查版本，并执行 Web 的完整质量门槛：

```bash
cd apps/web
pnpm self-update
pnpm --version
pnpm check
pnpm build
```

`apps/web/package.json` 通过 `packageManager` 固定 pnpm 版本。在该目录执行 `pnpm self-update` 时，pnpm 会更新这个字段，而不是只升级全局命令。提交前必须检查版本变化，且不要使用 alpha、beta、rc 或其他预发布版本。

中国大陆开发者可以把全局依赖源切换为 npmmirror（原淘宝 npm 镜像）：

```bash
pnpm config set --global registry https://registry.npmmirror.com
pnpm config get registry
# Output: https://registry.npmmirror.com/
```

镜像只用于本地依赖下载，不要把它写入并提交到项目 `.npmrc`。CI、正式锁文件核实和发布流程使用 npm 官方 Registry。排查同步延迟或完整性问题时，恢复官方源：

```bash
pnpm config set --global registry https://registry.npmjs.org/
pnpm config get registry
# Output: https://registry.npmjs.org/
```

## 7. 核实命令

### API

```bash
cd apps/api
uv sync --frozen
uv run ruff check .
uv run mypy
uv run pytest
```

### Web

```bash
cd apps/web
pnpm install --frozen-lockfile
pnpm check
pnpm build
```

### Desktop（工程建立后）

```bash
cd apps/desktop
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm dist
```

Desktop 发布门槛还包括：Windows x64 安装、卸载和升级测试；macOS x64 / arm64 安装、签名、公证和升级测试。

## 8. 版本核实来源

- [Electron Releases](https://releases.electronjs.org/release)
- [Electron 安全清单](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)
- [electron-vite 文档](https://electron-vite.org/guide/)
- [electron-builder 自动更新](https://www.electron.build/docs/features/auto-update/)
- [PostgreSQL 版本策略](https://www.postgresql.org/support/versioning/)
- [pnpm self-update](https://pnpm.io/cli/self-update)
- [pnpm config](https://pnpm.io/cli/config)
- [npmmirror](https://npmmirror.com/)
- [pwdlib on PyPI](https://pypi.org/project/pwdlib/)
- [email-validator on PyPI](https://pypi.org/project/email-validator/)
- [phonenumbers on PyPI](https://pypi.org/project/phonenumbers/)
- [Pillow on PyPI](https://pypi.org/project/pillow/)
- [PyYAML on PyPI](https://pypi.org/project/PyYAML/)
- [i18next on npm](https://www.npmjs.com/package/i18next)
- [react-i18next on npm](https://www.npmjs.com/package/react-i18next)
- [Ant Design on npm](https://www.npmjs.com/package/antd)
- [Axios on npm](https://www.npmjs.com/package/axios)
- [Hey API OpenAPI TypeScript](https://www.npmjs.com/package/@hey-api/openapi-ts)
