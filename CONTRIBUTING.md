# 为 xnovel 贡献

感谢你帮助改进 xnovel。项目仍处于早期阶段，请让每次贡献聚焦一个可以验证的问题，并保持作者对正文和 AI 建议的最终控制权。

## 开始之前

- 阅读 [项目文档导航](docs/README.md)，确认产品与架构边界。
- 搜索 [现有 Issue](https://github.com/xiongxianzhu/xnovel/issues)，避免重复报告。
- 较大的功能、数据模型变化或破坏性改动先创建 Issue，再开始实现。
- 不要提交密钥、访问令牌、私人小说正文或完整模型输入。

## 报告问题

在 [GitHub Issues](https://github.com/xiongxianzhu/xnovel/issues/new/choose) 中选择 Bug 报告或功能建议表单。

Bug 报告应包含最小复现步骤、预期行为、实际行为和运行环境。功能建议先说明用户问题，再给出最小方案与可验证的验收标准。

## 准备开发环境

Fork 仓库后，从最新的 `main` 创建短生命周期分支：

```bash
git clone git@github.com:YOUR_NAME/xnovel.git
cd xnovel
git checkout -b feat/short-description
```

分支使用小写英文和连字符，推荐前缀：

- `feat/`：新增能力。
- `fix/`：修复缺陷。
- `docs/`：只修改文档。
- `chore/`：仓库配置和工具链维护。

### API

需要 Python 3.14+ 和 uv：

```bash
cd apps/api
uv sync --frozen
uv run ruff check .
uv run ruff format --check .
uv run mypy
uv run pytest
```

预期结果：依赖与 `uv.lock` 一致，格式、静态检查、类型检查和测试全部通过。启动本地 API 和数据库迁移的方法见 [README](README.md#启动后端)。

### Web

需要 Node.js 24+ 和仓库声明的 pnpm 版本：

```bash
cd apps/web
pnpm install --frozen-lockfile
pnpm check
pnpm build
```

预期结果：Lint、格式、类型检查、测试和生产构建全部通过。pnpm 升级与国内镜像配置见 [技术栈文档](docs/tech-stack.md#pnpm-维护与国内镜像)。

## 编写变更

- 遵循当前目录最近的 `AGENTS.md`、现有代码结构和测试方式。
- 修复缺陷时添加能够复现问题的测试。
- 不通过删除测试、弱化断言或绕过类型系统掩盖问题。
- API 契约、数据结构、依赖、架构或发布流程变化时，同步更新对应专项文档。
- AI 输出必须保持为候选内容，接受建议必须由作者显式确认。

## 提交与 Pull Request

提交信息采用 Conventional Commits：

```text
feat(editor): 增加文档自动保存
fix(api): 修复版本冲突响应
docs(contributing): 补充贡献流程
```

推送分支并创建 Pull Request：

```bash
git push -u origin feat/short-description
```

创建 PR 时：

1. 说明变更目的、影响范围和关联 Issue。
2. 只包含一个清晰主题，不夹带无关重构或生成产物。
3. 填写已经执行的验证命令和结果。
4. 说明迁移、兼容性、安全和回滚风险。
5. 确认相关文档已经同步。

GitHub Actions 会并行验证 API 与 Web。所有相关检查通过并完成评审后，维护者才能合并变更。
