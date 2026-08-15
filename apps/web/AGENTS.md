# xnovel Web Agent 工作指南

本文件为处理 `apps/web/` 的 Agent 提供前端专项指令，并补充仓库根目录的 [`AGENTS.md`](../../AGENTS.md)。修改界面前，还必须阅读同目录的 [`DESIGN.md`](DESIGN.md)。

## 沟通

- 默认使用简体中文回复和编写文档。
- 先说明结果，再补充必要的操作与限制。
- 保持表达简洁，避免重复说明和无关扩展。

### 回答前的澄清流程

处理用户提出的问题时，不直接给出最终答案。先向用户说明：

1. 问题中没有明确说出、但已默认成立的假设。
2. 仍缺少的关键信息，以及这些信息可能如何改变答案。
3. 人们处理这类问题时最常犯的一个错误。

## 技术基线

- React 19、TypeScript 6 和 Vite 8。
- pnpm 11 管理依赖，`pnpm-lock.yaml` 必须随依赖变化更新。
- TanStack Query 管理服务端状态。
- Zod 校验环境变量和不可信边界数据。
- Axios 负责 HTTP 传输，`@hey-api/openapi-ts` 从 FastAPI OpenAPI 生成类型与 SDK。
- Vitest 与 Testing Library 验证用户可观察行为。
- 原生 CSS 负责当前样式；引入新的样式系统前先形成明确决策。

不要根据记忆猜测依赖 API。先检查 `package.json`、锁文件、类型定义和现有用法。

## 开发命令

```bash
pnpm install
cp .env.example .env
pnpm dev
```

开发服务器默认地址：

```text
http://127.0.0.1:5173
```

提交前运行：

```bash
pnpm check
pnpm build
```

API 契约变化时运行：

```bash
pnpm api:schema
pnpm api:generate
pnpm api:check
```

`api:schema` 和 `api:check` 需要 uv、Python 3.14，以及通过 `apps/api/uv.lock` 同步的 API 依赖。纯前端环境只能更新已有 Schema 对应的客户端时，运行 `pnpm api:generate`；只读校验生成目录时运行 `pnpm api:client-check`。CI 由 API Job 校验 Schema，Web Job 校验生成客户端，避免在 Web Job 重复安装 Python。

单独排查问题时可以运行 `pnpm lint`、`pnpm typecheck`、`pnpm test` 或 `pnpm format:check`。

## 目录职责

```text
src/
├─ app/                    # 应用入口、路由和全局 Provider
├─ pages/                  # 路由级页面组合
├─ features/               # 按小说业务能力组织的功能模块
├─ shared/
│  ├─ api/                 # 通用 HTTP 基础设施
│  ├─ config/              # 环境与运行时配置
│  └─ styles/              # 全局样式和设计令牌
└─ test/                   # 测试环境与跨测试辅助工具
```

只有真实功能出现时才创建目录。推荐的功能边界包括 `projects`、`documents`、`story-planning` 和 `ai-assistant`，但不要预先建立空模块。

## 依赖方向

- `app` 可以组合 `pages`、`features` 和 `shared`。
- `pages` 可以组合多个 `features`，但不承载可复用业务规则。
- `features` 可以依赖 `shared`，不能互相读取内部文件。
- `shared` 不依赖 `features`、`pages` 或 `app`。
- 跨功能复用时先暴露窄小的公共入口，不建立全局“杂物”目录。

当 Web 与桌面端确实复用同一能力后，再将稳定代码迁移到仓库 `packages/`。

## React 与 TypeScript

- 使用函数组件和命名导出。
- 组件负责展示和交互，数据转换与请求逻辑放在独立模块或 Hook 中。
- 优先从状态推导界面，不复制可以计算出的状态。
- 不用 `any` 绕过类型系统；外部数据先以 `unknown` 接收并校验。
- 保持组件属性小而明确。布尔属性使用能够表达正向含义的名称。
- 不在渲染阶段产生网络请求、持久化或其他副作用。
- 仅在确有性能证据时使用记忆化，不把 `useMemo` 和 `useCallback` 当作默认模板。

## 数据访问

- 所有 HTTP 请求通过 `src/shared/api/` 中的基础设施发出。
- 业务代码直接导入 `src/shared/api/generated/` 中需要的 SDK 函数和类型，并为每次 SDK 调用显式传入 `src/shared/api/client.ts` 导出的 `apiClient`；不手写重复响应类型，也不编辑生成文件。
- 受保护请求统一使用 `Authorization: Bearer <access_token>`；访问令牌只保存在内存，不使用独立管理请求头。
- `VITE_API_BASE_URL` 是浏览器端 API 基地址；任何 `VITE_` 变量都视为公开信息。
- 服务端状态使用 TanStack Query，不在多个组件中重复维护请求状态。
- Query Key 必须稳定，并包含会改变结果的全部参数。
- Mutation 成功后只失效相关查询，避免无差别刷新全部缓存。
- 界面必须区分首次加载、后台刷新、空结果、权限不足和请求失败。
- 不在浏览器端保存模型供应商密钥，也不把完整小说正文写入分析日志。

## 组件与交互

- 先使用语义化 HTML，再增加 ARIA 属性。
- 表单控件必须有可感知标签，错误信息要说明修复方法。
- 所有按钮、链接、菜单和编辑操作支持键盘操作。
- 异步按钮显示进行中状态，并阻止重复提交。
- 破坏性操作要求明确确认，同时说明影响范围。
- AI 建议与作者正文在视觉和数据上保持分离；接受建议必须是显式操作。
- 文案使用简洁中文。技术状态、错误码和日志信息可以保留英文。

## 样式规则

- 使用 [`DESIGN.md`](DESIGN.md) 定义的颜色、排版、间距和组件状态。
- 新增颜色或尺寸前，先检查现有令牌能否表达需求。
- 页面优先适配桌面写作场景，同时保证 320px 宽度下不出现横向溢出。
- 不用装饰性动画干扰写作；始终支持 `prefers-reduced-motion`。
- 不通过颜色单独传达状态。
- 不使用内联样式处理长期存在的视觉规则。

## 测试策略

- 测试用户能看到或操作的行为，不断言组件内部实现。
- 优先使用角色、名称和标签查询元素。
- 新增数据请求时覆盖成功、空结果和失败路径。
- 修复缺陷时先添加能够复现问题的测试。
- 避免大范围快照；只在稳定、可读的小型输出上使用快照。

示例：

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, it } from "vitest";

function SaveButton() {
  const [saved, setSaved] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setSaved(true)}>
        保存
      </button>
      {saved && <p>已保存</p>}
    </>
  );
}

it("confirms a successful save", () => {
  render(<SaveButton />);
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(screen.getByText("已保存")).toBeVisible();
});
```

## Git

- 提交信息采用 Conventional Commits，例如 `feat(auth): 添加路由守卫`。
- 提交描述默认使用简体中文。
- 只暂存当前任务相关文件；提交前检查暂存内容，不得夹带日志、构建产物、编辑器文件或敏感信息。
- 不得对 `.gitignore` 忽略的目录或文件执行 `git add`；忽略规则只防未被追踪的文件，显式 `add` 会绕过忽略。
- 用户明确调用 `git-commit` Skill 时，提交当前任务相关改动后推送当前分支。
- 当前分支没有上游时，将上游设置为 `origin` 的同名分支后推送。
- 没有可提交改动但存在未推送提交时，只执行推送，不创建空提交。
- 提交失败时不继续推送；推送失败时保留本地提交，并报告失败原因和当前状态。
- 禁止强制推送、覆盖远端历史或暂存无关文件来规避失败。

## Web 完成标准

- `pnpm check` 和 `pnpm build` 通过。
- 新增界面覆盖加载、空状态、错误和窄屏布局。
- 关键路径可以只用键盘完成，焦点清晰可见。
- 没有新增控制台错误、未处理 Promise 或不必要请求。
- 视觉实现符合 `DESIGN.md`，新增模式已经写回设计规范。
- API 契约变化同步更新仓库 `docs/api.md`。
