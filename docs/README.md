# xnovel 文档导航

本目录记录 xnovel 的产品边界、技术决策和交付状态。代码与文档冲突时，先确认真实行为，再在同一次变更中修正文档。

## 阅读顺序

1. [`prd.md`](prd.md)：确认用户、范围和首版验收标准。
2. [`architecture.md`](architecture.md)：理解前后端、桌面端和 AI 边界。
3. [`database.md`](database.md)：查看业务表、关系、约束和迁移策略。
4. [`tech-stack.md`](tech-stack.md)：确认运行时、依赖与版本策略。
5. [`api.md`](api.md)：查看已经存在的接口和错误格式。
6. [`ai-integration.md`](ai-integration.md)：确认模型接入、安全和上下文策略。
7. [`deployment.md`](deployment.md)：了解本地运行、发布和回滚要求。
8. [`tasks.md`](tasks.md)：按阶段选择下一项可验证任务。

## 设计记录

- [`superpowers/specs/2026-08-15-github-collaboration-design.md`](superpowers/specs/2026-08-15-github-collaboration-design.md)：GitHub 贡献、Issue、PR 与持续集成设计。
- [`superpowers/specs/2026-08-15-web-design-system-merge-design.md`](superpowers/specs/2026-08-15-web-design-system-merge-design.md)：Web 设计规范融合、扁平化与工作台布局决策。
- [`superpowers/specs/2026-08-15-auth-profile-i18n-theme-design.md`](superpowers/specs/2026-08-15-auth-profile-i18n-theme-design.md)：Web 账户、动态注册、国际化、跨端主题与 Skill 管理设计。

## 文档维护规则

- 产品范围变化时更新 `prd.md`。
- 服务边界或数据流变化时更新 `architecture.md`。
- 数据模型、表、约束、索引或迁移策略变化时更新 `database.md`。
- 新增依赖或调整运行时版本时更新 `tech-stack.md`。
- FastAPI 路径、字段或错误格式变化时更新 `api.md`。
- 模型供应商、密钥、上下文或审计策略变化时更新 `ai-integration.md`。
- 发布目标、环境变量或回滚方式变化时更新 `deployment.md`。
