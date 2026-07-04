import json
from datetime import datetime, timezone

import httpx

# Тематические кластеры в рамках Artificial Intelligence and Neural Network Technologies
CLUSTERS = [
    "Large Language Models",
    "Generative Adversarial Networks",
    "Neuromorphic Computing",
    "AI Hardware Accelerators",
    "AutoML and Self-Improving Systems",
    "Reinforcement Learning and Decision Systems",
]

OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "mistralai/mistral-small-3.2-24b-instruct"  # Mistral Small 3.2: нет thinking, свежая (март 2026)


def get_todays_cluster() -> str:
    """Детерминированная per-run ротация кластера.

    Каждые 2 часа UTC выбирается новый кластер (cron 0 */2 * * *, 12 запусков в сутки).
    Формула даёт ровно 2 запуска на каждый из 6 кластеров в сутки.
    """
    now = datetime.now(timezone.utc)
    # hour // 2 даёт 12 уникальных слотов в сутки; ordinal * 12 сдвигает начало каждый день
    slot = (now.toordinal() * 12 + now.hour // 2) % len(CLUSTERS)
    return CLUSTERS[slot]


def _build_prompt(cluster: str, used_keywords: list[str]) -> str:
    # Все фразы кластера передаются в блок исключений — модель не регенерирует уже известные.
    # При ~600 фразах × ~5 токенов ≈ 3 000 токенов; Mistral 32k держит легко.
    exclusion_block = (
        "\n\nDo NOT generate any of these already-used phrases:\n"
        + "\n".join(f"- {k}" for k in used_keywords)
        if used_keywords else ""
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
    cluster_keywords: list[str],
    api_key: str,
    cluster: str,
) -> list[str]:
    """Возвращает список уникальных фраз для указанного кластера.

    cluster_keywords — только фразы активного кластера (не вся таблица).
    Это кардинально снижает постфактумный отсев: used_set содержит
    только релевантные конкурирующие фразы, а не все ~3800 из базы.
    """
    prompt = _build_prompt(cluster, cluster_keywords)

    # used_set — только фразы текущего кластера (кластер-скопированная дедупликация)
    used_set = set(k.lower().strip() for k in cluster_keywords)

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/HelgDemidov/scopus_search_code",
        "X-Title": "ScopusSeeder",
    }

    payload = {
        "model": MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.8,  # Высокая температура — максимальное разнообразие фраз
        "max_tokens": 4500,  # 120 фраз × ~10 токенов на выходе — блок исключений в input, не в output
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
        candidates = []

        # Ищем начало JSON-массива — закрывающего ] может не быть (усечённый ответ)
        start = raw_content.find('[')
        if start != -1:
            fragment = raw_content[start:]

            # Сначала пробуем распарсить как есть (вдруг ] всё-таки есть)
            try:
                candidates = json.loads(fragment)
            except json.JSONDecodeError:
                # Ответ усечён: убираем хвостовой мусор (незакрытая строка или запятая)
                # и достраиваем закрывающую скобку
                clean = fragment.rstrip()
                # Убираем оборванную последнюю запись: ищем последнюю закрывающую кавычку
                last_quote = clean.rfind('"')
                if last_quote != -1:
                    # Проверяем, закрыта ли строка: ищем парную открывающую кавычку
                    prev_quote = clean.rfind('"', 0, last_quote)
                    if prev_quote != -1:
                        # Если после последней закрывающей кавычки нет запятой — строка полная
                        after = clean[last_quote + 1:].strip().lstrip(',').strip()
                        if not after or after == ']':
                            # Строка полная — обрезаем до неё и закрываем массив
                            truncated = clean[:last_quote + 1].rstrip().rstrip(',')
                        else:
                            # Строка оборвана — обрезаем до предыдущей полной записи
                            truncated = clean[:prev_quote].rstrip().rstrip(',')
                        try:
                            candidates = json.loads(truncated + ']')
                        except json.JSONDecodeError:
                            candidates = []

        if not candidates:
            raise RuntimeError(
                f"Не удалось распарсить ответ OpenRouter: {raw_content[:300]}"
            )

    # Финальная фильтрация: убираем фразы кластера, уже использованные ранее
    seen_in_run: set[str] = set()
    unique = []
    for kw in candidates:
        if not isinstance(kw, str):
            continue
        normalized = kw.strip().lower()
        if normalized and normalized not in used_set and normalized not in seen_in_run:
            unique.append(kw.strip())
            seen_in_run.add(normalized)

    return unique
