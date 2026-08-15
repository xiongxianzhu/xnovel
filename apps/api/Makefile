.PHONY: help install setup dev migrate revision test lint format typecheck check prod-install clean

UV ?= uv
APP := app.main:app
HOST ?= 127.0.0.1
PORT ?= 8000
MSG ?= update

help: ## 显示可用命令
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

install: ## 安装依赖（含 dev 组）
	$(UV) sync

setup: ## 复制 .env.example 为 .env（若不存在）
	@test -f .env || cp .env.example .env

dev: setup ## 开发服务器（uvicorn 热重载）
	$(UV) run uvicorn $(APP) --reload --host $(HOST) --port $(PORT)

migrate: ## 执行数据库迁移（alembic upgrade head）
	$(UV) run alembic upgrade head

revision: setup ## 生成迁移（make revision MSG="描述"）
	$(UV) run alembic revision --autogenerate -m "$(MSG)"

test: ## 运行测试
	$(UV) run pytest

lint: ## ruff 检查
	$(UV) run ruff check .

format: ## ruff 格式化
	$(UV) run ruff format .

typecheck: ## mypy 类型检查
	$(UV) run mypy

check: lint typecheck test ## lint + mypy + pytest

prod-install: ## 生产依赖（frozen、无 dev 组）
	$(UV) sync --frozen --no-dev

clean: ## 清理缓存与构建产物
	rm -rf .pytest_cache .ruff_cache .mypy_cache
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
