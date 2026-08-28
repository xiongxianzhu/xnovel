"""四种 Provider 协议的统一流式适配器。"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from typing import Any

import httpx


@dataclass(frozen=True)
class ProviderEvent:
    type: str
    text: str = ""
    usage: dict[str, int | None] | None = None


def _join(base_url: str, suffix: str) -> str:
    return f"{base_url.rstrip('/')}/{suffix.lstrip('/')}"


def _request_parts(
    protocol: str,
    base_url: str,
    api_key: str | None,
    model: str,
    messages: list[dict[str, str]],
    max_output_tokens: int,
) -> tuple[str, dict[str, str], dict[str, Any]]:
    headers = {"Accept": "text/event-stream", "Content-Type": "application/json"}
    if protocol in {"openai_chat", "openai_responses"}:
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        if protocol == "openai_chat":
            return (
                _join(base_url, "chat/completions"),
                headers,
                {
                    "model": model,
                    "messages": messages,
                    "max_tokens": max_output_tokens,
                    "stream": True,
                    "stream_options": {"include_usage": True},
                },
            )
        return (
            _join(base_url, "responses"),
            headers,
            {
                "model": model,
                "input": messages,
                "max_output_tokens": max_output_tokens,
                "stream": True,
            },
        )
    if protocol == "anthropic":
        if api_key:
            headers["x-api-key"] = api_key
        headers["anthropic-version"] = "2023-06-01"
        return (
            _join(base_url, "messages"),
            headers,
            {"model": model, "messages": messages, "max_tokens": max_output_tokens, "stream": True},
        )
    if protocol == "google":
        if api_key:
            headers["x-goog-api-key"] = api_key
        contents = [
            {"role": "user" if item["role"] != "assistant" else "model", "parts": [{"text": item["content"]}]}
            for item in messages
        ]
        return (
            _join(base_url, f"models/{model}:streamGenerateContent?alt=sse"),
            headers,
            {"contents": contents, "generationConfig": {"maxOutputTokens": max_output_tokens}},
        )
    raise ValueError("unsupported provider protocol")


def _int_or_none(value: Any) -> int | None:
    return value if isinstance(value, int) and value >= 0 else None


def parse_provider_payload(protocol: str, payload: dict[str, Any]) -> list[ProviderEvent]:
    events: list[ProviderEvent] = []
    if protocol == "openai_chat":
        choices = payload.get("choices")
        if isinstance(choices, list) and choices:
            delta = choices[0].get("delta", {}) if isinstance(choices[0], dict) else {}
            text = delta.get("content") if isinstance(delta, dict) else None
            if isinstance(text, str) and text:
                events.append(ProviderEvent(type="delta", text=text))
        usage = payload.get("usage")
        if isinstance(usage, dict):
            events.append(
                ProviderEvent(
                    type="usage",
                    usage={
                        "input_tokens": _int_or_none(usage.get("prompt_tokens")),
                        "output_tokens": _int_or_none(usage.get("completion_tokens")),
                        "cache_read_tokens": _int_or_none(usage.get("prompt_cache_hit_tokens")),
                        "reasoning_tokens": _int_or_none(usage.get("reasoning_tokens")),
                    },
                )
            )
    elif protocol == "openai_responses":
        event_type = payload.get("type")
        if event_type == "response.output_text.delta" and isinstance(payload.get("delta"), str):
            events.append(ProviderEvent(type="delta", text=payload["delta"]))
        response = payload.get("response")
        if event_type == "response.completed" and isinstance(response, dict):
            usage = response.get("usage")
            if isinstance(usage, dict):
                events.append(
                    ProviderEvent(
                        type="usage",
                        usage={
                            "input_tokens": _int_or_none(usage.get("input_tokens")),
                            "output_tokens": _int_or_none(usage.get("output_tokens")),
                            "cache_read_tokens": _int_or_none(
                                usage.get("input_tokens_details", {}).get("cached_tokens")
                            )
                            if isinstance(usage.get("input_tokens_details"), dict)
                            else None,
                            "reasoning_tokens": _int_or_none(
                                usage.get("output_tokens_details", {}).get("reasoning_tokens")
                            )
                            if isinstance(usage.get("output_tokens_details"), dict)
                            else None,
                        },
                    )
                )
    elif protocol == "anthropic":
        delta = payload.get("delta")
        if payload.get("type") == "content_block_delta" and isinstance(delta, dict):
            text = delta.get("text")
            if isinstance(text, str) and text:
                events.append(ProviderEvent(type="delta", text=text))
        usage = payload.get("usage")
        if isinstance(usage, dict):
            events.append(
                ProviderEvent(
                    type="usage",
                    usage={
                        "input_tokens": _int_or_none(usage.get("input_tokens")),
                        "output_tokens": _int_or_none(usage.get("output_tokens")),
                        "cache_read_tokens": _int_or_none(usage.get("cache_read_input_tokens")),
                        "reasoning_tokens": None,
                    },
                )
            )
    elif protocol == "google":
        candidates = payload.get("candidates")
        if isinstance(candidates, list) and candidates:
            content = candidates[0].get("content", {}) if isinstance(candidates[0], dict) else {}
            parts = content.get("parts") if isinstance(content, dict) else None
            if isinstance(parts, list):
                for part in parts:
                    text = part.get("text") if isinstance(part, dict) else None
                    if isinstance(text, str) and text:
                        events.append(ProviderEvent(type="delta", text=text))
        usage = payload.get("usageMetadata")
        if isinstance(usage, dict):
            events.append(
                ProviderEvent(
                    type="usage",
                    usage={
                        "input_tokens": _int_or_none(usage.get("promptTokenCount")),
                        "output_tokens": _int_or_none(usage.get("candidatesTokenCount")),
                        "cache_read_tokens": _int_or_none(usage.get("cachedContentTokenCount")),
                        "reasoning_tokens": _int_or_none(usage.get("thoughtsTokenCount")),
                    },
                )
            )
    return events


async def stream_provider(
    *,
    protocol: str,
    base_url: str,
    api_key: str | None,
    model: str,
    messages: list[dict[str, str]],
    max_output_tokens: int,
    timeout_seconds: int,
    client_factory: Callable[..., httpx.AsyncClient] = httpx.AsyncClient,
) -> AsyncIterator[ProviderEvent]:
    url, headers, body = _request_parts(protocol, base_url, api_key, model, messages, max_output_tokens)
    timeout = httpx.Timeout(timeout_seconds, connect=10.0, write=30.0, pool=5.0)
    async with client_factory(timeout=timeout, follow_redirects=False, trust_env=False) as client:
        async with client.stream("POST", url, headers=headers, json=body) as response:
            if response.is_redirect:
                raise httpx.HTTPStatusError("provider redirect rejected", request=response.request, response=response)
            response.raise_for_status()
            async for line in response.aiter_lines():
                value = line.strip()
                if not value or value.startswith("event:"):
                    continue
                if value.startswith("data:"):
                    value = value[5:].strip()
                if value == "[DONE]":
                    break
                try:
                    payload = json.loads(value)
                except json.JSONDecodeError:
                    continue
                if isinstance(payload, dict):
                    for event in parse_provider_payload(protocol, payload):
                        yield event
