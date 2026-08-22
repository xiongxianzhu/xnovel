<div align="center">

# xnovel Web

xnovel 的 React 网页端，通过 FastAPI OpenAPI 生成类型安全的 Axios SDK。

[![React](https://img.shields.io/badge/React-19.2.8-61DAFB?logo=react&logoColor=white&style=for-the-badge)](https://react.dev/)
[![Axios](https://img.shields.io/badge/Axios-1.19.0-5A29E4?logo=axios&logoColor=white&style=for-the-badge)](https://axios-http.com/)

</div>

当前工程已经实现 Web 登录与会话恢复、受保护路由、三语言、五套主题和用户偏好自动保存。技术基础包括 Ant Design、React Router、TanStack Query、i18next、Zod、Vitest 和 Testing Library。

## 启动

```bash
pnpm install
cp .env.example .env
pnpm dev
```

输出：

```text
Local: http://127.0.0.1:5173
```

## 验证

```bash
pnpm check
pnpm build
```

## 同步 API 客户端

完整执行本节命令还需要安装 uv、Python 3.14，并先在 `apps/api/` 运行 `uv sync --frozen` 安装 API 锁定依赖。只处理已有 OpenAPI 文件的纯前端环境可以运行 `pnpm api:generate` 和 `pnpm api:client-check`。

API 路由或 Schema 变化后，从 Web 目录依次运行：

```bash
pnpm api:schema
pnpm api:generate
pnpm api:check
```

`api:schema` 从 FastAPI 离线导出 `openapi/openapi.json`。`api:generate` 将它转换为 `src/shared/api/generated/` 下的 Axios 类型与 SDK。`api:check` 以只读方式检查 Schema 和生成目录是否同步，包括生成器新增或删除的文件。CI 的 API Job 负责校验 Schema，Web Job 只用已提交的 Schema 校验生成客户端，因此 Web Job 不重复安装 Python。

生成目录不能手工编辑。业务代码直接导入需要的 SDK 函数和类型，并在调用时显式传入 `src/shared/api/client.ts` 导出的 `apiClient`；生成器不会提供未配置的默认客户端。运行时基地址、Bearer 令牌和错误适配保留在 `src/shared/api/` 的手写模块中。

## 目录

```text
src/
├─ app/          启动、Provider 和应用壳层
├─ features/     按小说领域组织的功能
├─ pages/        路由级页面
├─ shared/       API、生成客户端、配置、样式和无业务工具
└─ test/         测试环境
```

OpenAPI 输入保存在 `openapi/`，生成器配置位于 `openapi-ts.config.ts`。

只有两个前端应用稳定复用的能力才迁入仓库根目录 `packages/`。
