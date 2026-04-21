import asyncio
import json
from datetime import date

import re
import httpx

# Тематические кластеры в рамках Artificial Intelligence and Neural Network Technologies
CLUSTERS = [
    "Large Language Models",
    "Generative Adversarial Networks",
    "Neuromorphic Computing",
    "AI Hardware Accelerators",
    "AutoML and Self-Improving Systems",
]

OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "google/gemini-2.5-flash"  # Обновлено: gemini-flash-1.5 удалена с OpenRouter


def _get_todays_cluster() -> str:
    # Детерминированная ротация: каждый день недели использует свой кластер
    return CLUSTERS[date.today().toordinal() % len(CLUSTERS)]


def _build_prompt(cluster: str, used_keywords: list[str]) -> str:
    # Формируем промпт с последними 50 использованными фразами для исключения повторов
    recent = used_keywords[-50:] if len(used_keywords) > 50 else used_keywords
    exclusion_block = (
        f"\n\nDo NOT generate any of these already-used phrases:\n"
        + "\n".join(f"- {k}" for k in recent)
        if recent else ""
    )
    return (
        f"You are a scientific search query specialist for Scopus API queries.\n"
        f"Generate exactly 120 unique English search phrases for the topic cluster: '{cluster}'.\n"
        f"General domain: Artificial Intelligence and Neural Network Technologies.\n"
        f"Rules:\n"
        f"- Each phrase must be 2-6 words long\n"
        f"- Use terminology from academic publications (suitable for Scopus)\n"
        f"- All phrases must be unique and diverse\n"
        f"- No duplicates, no numbering, no bullet points\n"
        f"- Return ONLY a JSON array of strings, e.g.: [\"phrase one\", \"phrase two\"]\n"
        f"- No markdown, no explanations, no code blocks"
        f"{exclusion_block}"
    )


async def generate_keywords(
    used_keywords: list[str],
    api_key: str,
) -> tuple[list[str], str]:
    """Возвращает (keywords, cluster) — список уникальных фраз и имя кластера."""
    cluster = _get_todays_cluster()
    prompt = _build_prompt(cluster, used_keywords)

    used_set = set(k.lower().strip() for k in used_keywords)

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/HelgDemidov/scopus_search_code",
        "X-Title": "ScopusSeeder",
    }

    payload = {
        "model": MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.9,  # Высокая температура — максимальное разнообразие фраз
        "max_tokens": 2048,  # 120 фраз × ~10 токенов + запас
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(OPENROUTER_API_URL, headers=headers, json=payload)

    if response.status_code != 200:
        raise RuntimeError(
            f"OpenRouter вернул {response.status_code}: {response.text}"
        )

    # Извлекаем текст из ответа модели
    raw_content = response.json()["choices"][0]["message"]["content"].strip()

    # Парсим JSON-массив из ответа
    try:
        candidates: list[str] = json.loads(raw_content)

    except json.JSONDecodeError:
        import re
        candidates: list[str] = []  # инициализируем до входа в if — Pylance доволен
        match = re.search(r'\[.*\]', raw_content, re.DOTALL)
        if match:
            try:
                candidates = json.loads(match.group())
            except json.JSONDecodeError:
                # Ответ усечён — достраиваем закрывающую скобку и парсим то, что есть
                truncated = match.group().rstrip().rstrip(',')
                try:
                    candidates = json.loads(truncated + ']')
                except json.JSONDecodeError:
                    candidates = []  # оба варианта провалились — упадём ниже
        if not candidates:
            raise RuntimeError(
                f"Не удалось распарсить ответ OpenRouter: {raw_content[:300]}"
            )

    # Финальная фильтрация: убираем уже использованные фразы
    unique = [
        kw.strip() for kw in candidates
        if isinstance(kw, str) and kw.strip().lower() not in used_set
    ]

    return unique, cluster
