"""内置 Provider 目录。"""

from __future__ import annotations

from app.schemas.ai import ProviderCatalogItem

_CATALOG = [
    ("deepseek", "DeepSeek", "openai_chat", "https://api.deepseek.com"),
    ("openai", "OpenAI", "openai_responses", "https://api.openai.com/v1"),
    ("anthropic", "Anthropic", "anthropic", "https://api.anthropic.com/v1"),
    ("google", "Google Gemini", "google", "https://generativelanguage.googleapis.com/v1beta"),
    ("openrouter", "OpenRouter", "openai_chat", "https://openrouter.ai/api/v1"),
    ("moonshot", "Moonshot AI", "openai_chat", "https://api.moonshot.cn/v1"),
    ("z-ai", "Z.AI", "openai_chat", "https://api.z.ai/api/paas/v4"),
    ("minimax", "MiniMax", "openai_chat", "https://api.minimax.io/v1"),
    ("mistral", "Mistral", "openai_chat", "https://api.mistral.ai/v1"),
    ("xai", "xAI", "openai_chat", "https://api.x.ai/v1"),
    ("groq", "Groq", "openai_chat", "https://api.groq.com/openai/v1"),
    ("together", "Together AI", "openai_chat", "https://api.together.xyz/v1"),
    ("fireworks", "Fireworks AI", "openai_chat", "https://api.fireworks.ai/inference/v1"),
    ("cerebras", "Cerebras", "openai_chat", "https://api.cerebras.ai/v1"),
    ("nvidia", "NVIDIA", "openai_chat", "https://integrate.api.nvidia.com/v1"),
    ("hugging-face", "Hugging Face", "openai_chat", "https://router.huggingface.co/v1"),
]

BUILTIN_PROVIDERS = {
    item.provider_id: item
    for item in [
        ProviderCatalogItem(
            provider_id=provider_id,
            display_name=display_name,
            protocol=protocol,  # type: ignore[arg-type]
            base_url=base_url,
        )
        for provider_id, display_name, protocol, base_url in _CATALOG
    ]
}
