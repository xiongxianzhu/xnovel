# xnovel 部署与发布

> 状态：Draft  
> 最后更新：2026-08-16

## 1. 当前部署模型

```text
Browser -> Web static assets -> FastAPI -> PostgreSQL
                                      -> AI Providers

Electron renderer -> preload IPC -> Electron main -> local SQLite
                                              -> local files
                                              -> AI Providers
```

Web 静态资源、FastAPI 和 PostgreSQL 分别部署。Electron 打包 React 产物和本地数据能力，通过版本发布获得更新，不依赖线上 FastAPI 才能完成基础写作与保存。

## 2. 本地环境

| 服务    | 默认地址                     | 配置来源        |
| ------- | ---------------------------- | --------------- |
| Web     | `http://127.0.0.1:5173`      | `apps/web/.env` |
| API     | `http://127.0.0.1:8000`      | `apps/api/.env` |
| OpenAPI | `http://127.0.0.1:8000/docs` | FastAPI         |

## 3. 环境变量

### Web

| 变量                | 必填 | 默认值                  | 说明         |
| ------------------- | ---- | ----------------------- | ------------ |
| `VITE_API_BASE_URL` | 否   | `http://127.0.0.1:8000` | FastAPI 地址 |

所有 `VITE_` 变量都会进入浏览器包，不能保存秘密。

### API

API 当前使用 `APP_ENV`、`SECRET_KEY` 和 `DATABASE_URL`。开发与正式环境的 PostgreSQL 数据库名固定为 `xnovel`；GitHub Actions 使用隔离库 `xnovel_test`。`SECRET_KEY` 同时派生注册限流的 HMAC 专用密钥，生产轮换会重置当前限流窗口，但不会影响账户数据。媒体与 Skill 能力落地后增加以下配置；实现前不得让缺失目录静默回退到临时路径：

| 变量                 | 必填 | 说明                                       |
| -------------------- | ---- | ------------------------------------------ |
| `MEDIA_ROOT`         | 是   | Web 上传头像和全局站点 Logo 的持久化根目录 |
| `SKILL_STORAGE_ROOT` | 是   | Web Skill 暂存、原始包、规范化包和版本目录 |

Web AI 凭据能力落地后增加以下服务端 Secret/策略配置；这些变量不能使用 `VITE_` 前缀，也不能返回浏览器：

| 变量                                   | 必填   | 说明                                               |
| -------------------------------------- | ------ | -------------------------------------------------- |
| `XNOVEL_CREDENTIAL_MASTER_KEY`         | 是     | 当前 Base64 编码的 32 字节 AES-256-GCM 主密钥      |
| `XNOVEL_CREDENTIAL_MASTER_KEY_VERSION` | 是     | 当前主密钥的稳定版本标识                           |
| `XNOVEL_CREDENTIAL_PREVIOUS_KEYS`      | 轮换时 | 旧版本到 Base64 密钥的 JSON 映射；完成重加密后移除 |
| `AI_PROVIDER_EXTRA_ALLOWED_ORIGINS`    | 否     | 显式允许的 HTTP、环回、私网或本机 Origin JSON 数组 |

默认策略只允许公网 HTTPS 和内置 Provider 官方 Origin。`AI_PROVIDER_EXTRA_ALLOWED_ORIGINS` 只放行精确 Origin，不接受通配符、路径、userinfo 或任意 CIDR；加入本地 Origin 等于部署管理员接受对应无认证或内网访问风险。Provider HTTP 客户端仍须校验 DNS 与实际对端，并禁止重定向，不能把该配置当作唯一 SSRF 防线。

生产环境必须生成新的 `SECRET_KEY`，并通过部署平台的安全配置注入。AI 功能启用时还必须独立生成凭据主密钥；不能复用 `SECRET_KEY`，也不能在镜像、仓库、日志或数据库备份中保存主密钥。`MEDIA_ROOT` 与 `SKILL_STORAGE_ROOT` 必须位于持久化卷，使用不同子目录，且不能由静态服务器直接列目录或执行文件。

### Desktop

Desktop 不使用 `DATABASE_URL`，也不要求用户配置 FastAPI 地址。数据库路径由 `app.getPath("userData")` 决定；Provider 地址等非敏感设置保存在 SQLite。主进程通过 `safeStorage` 加解密 Provider 密钥，并把密文写入 `userData/credentials.v1.json`。本地 Skill 根目录固定为当前用户主目录下的 `~/.agents/skills/`，不是部署变量，也不由安装程序创建或修改。

## 4. Web 发布门槛

```bash
cd apps/web
pnpm install --frozen-lockfile
pnpm check
pnpm build
```

输出：

```text
dist/
```

托管平台需要把未知前端路由回退到 `index.html`，但不能把 API 和静态资源错误回退为 HTML。

CI 在发布构建前执行两段契约漂移检查：API Job 使用离线导出器校验 `apps/web/openapi/openapi.json`，Web Job 在临时目录重新生成 Axios SDK，并按文件清单与字节内容比较仓库版本，新增、删除或变化的生成文件都会失败。部署阶段使用已通过检查并进入版本控制的 Schema 与生成客户端，不从生产 API 地址临时生成代码。

## 5. API 发布门槛

```bash
cd apps/api
uv sync --frozen --no-dev
uv run alembic upgrade head
uv run fastapi run --host 127.0.0.1 --port 8000
```

API 目录已有 `uv.lock`。生产发布使用 `uv sync --frozen --no-dev`，不得在发布过程中重新解析依赖。

发布前执行 API 测试，并确认 `/api/v1/health` 返回 `{"code":0,"msg":"SUCCESS","data":{"status":"ok"}}`。

Web AI 上线后，发布前还要验证当前主密钥版本可解密抽样凭据、旧版本密钥只在轮换窗口存在、Provider 额外 Origin 没有通配符，并通过地址策略、两任务并发和 120 秒遗留任务回收测试。健康检查不得尝试真实模型调用，也不得暴露 Provider、密钥尾号或允许列表。

当前首个迁移创建固定主键 `id = 1` 的 `site_settings`，并保持 `registration_enabled = false`。迁移完成后创建首个管理员：

```bash
cd apps/api
uv run python -m app.cli create-admin --username ADMIN --email ADMIN_EMAIL --nickname ADMIN_NICKNAME
# Output: Administrator created.
```

命令在终端隐藏读取并确认密码，不接受 `--password`。已有管理员或标识冲突时安全失败，不覆盖账户或提升普通用户。

使用当前启用管理员动态修改注册开关：

```bash
cd apps/api
uv run python -m app.cli set-registration --admin-username ADMIN --enabled
# Output: Registration setting updated.

uv run python -m app.cli set-registration --admin-username ADMIN --disabled
# Output: Registration setting updated.
```

开关值未变化时命令成功返回，但不重复写审计事件。公开注册使用 ASGI 连接地址限流，不直接解析任意 `X-Forwarded-For`。位于反向代理后时，只信任明确代理地址：

```bash
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --proxy-headers --forwarded-allow-ips="127.0.0.1"
```

将示例地址替换为实际反向代理 IP，不使用不受控的 `*`。生产健康检查还应验证后续媒体和 Skill 持久化目录可写，但不能在响应或日志中暴露真实路径。

### Web 持久化与备份

- PostgreSQL、`MEDIA_ROOT` 和 `SKILL_STORAGE_ROOT` 必须纳入同一恢复点目标，分别备份并定期做关联完整性演练。
- 媒体和 Skill 文件先发布、后提交数据库引用；数据库失败后清理新文件，清理失败的孤立文件由可重试任务回收。
- Skill 暂存区不进入长期备份。原始上传包、规范化包和当前仍被版本记录引用的内容目录必须可恢复。
- 恢复后检查头像、Logo、Skill 当前版本与存储键；悬空引用保持不可用并告警，不能改为任意默认文件。

## 6. Electron 打包与更新

桌面端默认发布以下 64 位产物：

| 平台            | 架构  | 安装与更新产物          |
| --------------- | ----- | ----------------------- |
| Windows 10 / 11 | x64   | NSIS 安装包与更新元数据 |
| macOS           | x64   | DMG、ZIP 与更新元数据   |
| macOS           | arm64 | DMG、ZIP 与更新元数据   |

首版不发布 Windows arm64、Windows 32 位或 Linux 版本。Windows 产物在 Windows runner 构建；macOS 两种架构在 macOS runner 构建，并完成 Developer ID 签名和 Apple 公证。

桌面端每次发布生成带 SemVer 版本号的安装包和 electron-updater 更新元数据。客户端检查新版本、校验签名、下载完成后提示用户重启。网页部署不会自动替换已经打包进 Electron 的 React 资源。

桌面业务数据保存在 `app.getPath("userData")` 下的 SQLite 数据库。封面、附件、导出文件和备份使用受控的本地目录。renderer 不直接访问数据库或任意文件路径。

Desktop Logo 随安装包固定，不从数据库或运行时配置加载。主题偏好保存在本地 SQLite；本地 Skill 内容继续留在 `~/.agents/skills/`，xnovel 只保存启用状态和已确认指纹，不把该目录复制进应用数据或默认备份。

每次涉及本地 Schema 的更新必须：

1. 在主进程启动写入服务前检查 Schema 版本。
2. 在破坏性迁移前创建可恢复备份。
3. 在单个事务中执行迁移，并在失败时回滚。
4. 验证旧版本数据库可以升级，升级后正文、外键和凭据引用保持完整。

默认内容备份包含 SQLite 和用户内容文件，不包含 `credentials.v1.json`。恢复后需要重新录入 AI 密钥。完整设备备份即使包含密文，也不保证能在另一设备、另一系统账户或重装后的系统中解密。

自动更新只替换应用文件，不删除或覆盖用户数据库。卸载程序默认保留用户数据；如果以后提供“同时删除数据”，必须单独确认并说明不可恢复范围。

正式发布前必须验证 Windows x64、macOS x64 和 macOS arm64 从上一稳定版升级到当前版本。详细依赖和安全基线见 [tech-stack.md](tech-stack.md)。

## 7. 回滚

- Web：切回上一份已验证的静态产物。
- API：回滚应用版本前确认数据库迁移是否向后兼容。
- Desktop：停止发布有问题的版本，并发布更高版本号的修复包。应用降级前先确认本地 Schema 向后兼容；不兼容时使用升级前备份恢复，而不是让旧版本直接打开新 Schema。
- AI：可以单独禁用 Provider，不影响基础写作与保存。

## 8. 发布后检查

- [ ] Web 首页和静态资源正常加载。
- [ ] API 健康检查和 OpenAPI 可访问。
- [ ] Web 使用正确 API 地址，CORS 配置匹配。
- [ ] 公开注册默认关闭，管理员动态切换后无需重启 API 即可生效。
- [ ] 头像与站点 Logo 上传、替换和失败回滚不产生悬空引用。
- [ ] Web Skill 存储限制、路径碰撞校验、版本发布和孤立文件回收正常。
- [ ] 保存失败不会丢失编辑内容。
- [ ] AI Provider 不可用时基础写作正常。
- [ ] Web Provider 密钥只能写入和替换，不能从 API 读回；数据库备份只有密文，独立恢复主密钥后抽样解密成功。
- [ ] 自定义 Provider 默认拒绝 HTTP、私网、环回、云元数据和重定向；管理员显式允许的本地 Origin 有持续风险提示。
- [ ] 正式 AI 任务与连接测试合计不超过每用户两个并发，超时遗留任务可以回收。
- [ ] 日志和构建产物不包含密钥。
- [ ] Desktop 无网络和未登录状态下可以创建、保存并重新打开作品。
- [ ] Desktop 从上一稳定版升级后可以打开原 SQLite 数据库。
- [ ] Desktop 迁移失败时保留原数据库和升级前备份。
- [ ] Desktop renderer 无法直接取得数据库句柄、任意文件访问能力或 AI 密钥。
- [ ] Desktop 内容备份恢复后，即使 AI 凭据缺失或无法解密，基础写作仍然可用并提示重新录入。
- [ ] Desktop 只读扫描 `~/.agents/skills/`；应用更新不会修改本地 Skill，任务前内容变化或超限会禁用并拒绝使用。

## 9. GitHub Actions 质量门槛

`.github/workflows/ci.yml` 在提交到 `main`、针对 `main` 的 Pull Request 和手动触发时运行。工作流并行执行：

- API：锁定依赖安装、Ruff 检查与格式检查、mypy、PostgreSQL 迁移、pytest，以及已提交 OpenAPI Schema 的确定性校验。pytest 直接针对迁移后的专用 PostgreSQL 数据库验证 JSONB、部分索引、`CHECK`、行锁竞争、限流原子 upsert、10/3 次边界和独立提交；不以 ORM 临时建表代替迁移验收。
- Web：锁定依赖安装、生成 API 客户端的文件清单与字节校验、`pnpm check` 和生产构建。

工作流只拥有 `contents: read` 权限，不使用生产密钥，也不执行部署或桌面端发布。Desktop 工程落地后，再按目标平台增加签名、打包和更新验证。
