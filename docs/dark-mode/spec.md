# Dark Mode — Техническое задание

**Статус:** В разработке (ветка `feat/dark-mode`)
**Принято:** 2026-06-27
**Стек:** React 18 / TypeScript / Tailwind CSS 3 / Canvas API

---

## 1. Обзор фичи

Тёмный режим для сайта Scopus Search с атмосферным фоном "ночного неба":
- Плавный переход (театральный при первой активации, быстрый при повторных)
- Canvas-анимация: звёздное небо с мерцанием
- Shooting stars: одиночные метеоры и метеорные дожди
- Полная инверсия цветов для всех UI-элементов и инфографики

---

## 2. Цветовая схема

### 2.1 Основной фон тёмного режима

**`#0d1b2a`** — глубокий индиго-навигаторский синий (OKLCH: `oklch(0.13 0.04 240)`)

Источники: Stellarium sky background, NASA Eyes on Solar System, ESA Science portal dark sections.
Контраст белого текста: **17.2:1** (WCAG AAA = 7:1 — превышение более чем вдвое).

### 2.2 Поверхности поверх фона

| Токен | Значение | Применение |
|---|---|---|
| `--background` | `#0d1b2a` | Фон страницы |
| `--card` | `#152236` | ChartCard, KpiTile, диалоги |
| `--popover` | `#152236` | Dropdown, ChartTooltip |
| `--border` | `rgba(255,255,255,0.08)` | Все бордеры в dark |
| `--foreground` | `oklch(0.985 0 0)` | Основной текст (без изменений) |

### 2.3 Изменения в `index.css` → блок `.dark {}`

Заменить `--background: oklch(0.145 0 0)` на `oklch(0.13 0.04 240)`.
Заменить `--card / --popover: oklch(0.205 0 0)` на `oklch(0.15 0.04 240)`.

---

## 3. Архитектура компонентов

### 3.1 Новые файлы

| Файл | Назначение |
|---|---|
| `src/components/theme/ThemeProvider.tsx` | React-контекст, localStorage, overlay-менеджер fade |
| `src/components/theme/StarFieldCanvas.tsx` | Canvas: звёзды + shooting stars + scheduler |
| `src/components/theme/ThemeToggle.tsx` | Кнопка Moon/Sun для Header |
| `src/hooks/useTheme.ts` | Читает ThemeContext |
| `src/hooks/useDimensionColors.ts` | Theme-aware цвета для Recharts |

### 3.2 Изменяемые файлы

| Файл | Изменение |
|---|---|
| `src/index.css` | `.dark {}` — новые значения `--background`, `--card`, `--popover` |
| `src/App.tsx` | Обернуть в `<ThemeProvider>`, `RootLayout`: `dark:bg-slate-900` → `bg-background` |
| `src/components/layout/Header.tsx` | Добавить `<ThemeToggle>`, фон `dark:bg-slate-900/95` → `dark:bg-[#0d1b2a]/95` |
| `src/pages/HomePage.tsx` | Кнопки режима поиска: `dark:bg-slate-900` → `dark:bg-[#0d1b2a]` |
| `src/components/charts/chartColors.ts` | Добавить dark-dimmed цвета; CartesianGrid stroke theme-aware |
| `src/components/charts/ChartCard.tsx` | `dark:bg-slate-800` → `dark:bg-[#152236]` |
| `src/components/charts/ChartTooltip.tsx` | `dark:bg-slate-800` → `dark:bg-[#152236]` |
| `src/components/explore/KpiTile.tsx` | `dark:bg-slate-800` → `dark:bg-[#152236]` |

---

## 4. ThemeProvider — логика fade-перехода

### 4.1 Двухрежимный fade (КРИТИЧНО для UX)

```
localStorage.getItem('nightSkyActivated') === null
  → Первая активация: fade 3500ms (театральный "звёздный занавес")
  → После завершения: localStorage.setItem('nightSkyActivated', '1')

localStorage.getItem('nightSkyActivated') === '1'
  → Все последующие переключения: fade 400ms
```

Логика overlay: при переходе light→dark появляется `position:fixed` overlay цвета `#0d1b2a`,
`opacity: 0 → 1` за N мс (CSS transition). Параллельно Canvas со звёздами проявляется.
По завершении: применяем `class="dark"` к `<html>`, убираем overlay.
Обратно dark→light: аналогично — overlay цвета `--background` (светлый) накрывает тёмное содержимое.

### 4.2 prefers-reduced-motion

```css
@media (prefers-reduced-motion: reduce) {
  /* Fade: мгновенный */
  /* Звёзды: статичные (без twinkling) */
  /* Shooting stars: полностью отключены */
}
```

---

## 5. StarFieldCanvas

### 5.1 Параметры звёзд

| Tier | Доля | baseBrightness | Мерцание |
|---|---|---|---|
| 1 (фоновая пыль) | 60% | 0.10–0.22 | нет |
| 2 (средние) | 30% | 0.28–0.50 | да, subtle |
| 3 (яркие) | 10% | 0.55–0.80 | да, заметное |

Всего звёзд: **400 desktop / 150 mobile** (определяется через `window.innerWidth < 768`).

### 5.2 Кластерное мерцание (асинхронное)

5 кластеров. Каждый кластер:
```
period_i  = rand(3s, 7s)         // индивидуальный период
phase_i   = rand(0, 2π)          // случайный сдвиг фазы
```
Яркость звезды Tier 2/3 в момент `t`:
```
alpha = baseBrightness × (1 + 0.20 × sin(t / period_i + phase_i))
```

### 5.3 Частота кадров

- **15 fps** в режиме только звёзды (`if elapsed < 66ms return`)
- **60 fps** пока активен хотя бы один метеор
- **Пауза** при `document.visibilityState === 'hidden'` (cancelAnimationFrame)
- **Resize**: `ResizeObserver` пересоздаёт canvas, звёзды генерируются заново

### 5.4 HiDPI / Retina

```js
const dpr = Math.min(window.devicePixelRatio, 2)
canvas.width  = width  * dpr
canvas.height = height * dpr
ctx.scale(dpr, dpr)
```

---

## 6. Shooting Stars

### 6.1 Два типа событий

| Тип | Интервал | Разброс |
|---|---|---|
| Одиночный метеор | 20 сек | ±10 сек |
| Метеорный дождь | 120 сек | ±30 сек |

**Взаимное исключение:** буфер конфликта = 8 сек.
Перед планированием следующего события проверяется, что другое событие не попадает в ±8s окно.
При конфликте: сдвиг на `gap + 8s`.

Активация: только в тёмном режиме + только после полного завершения fade-перехода.

### 6.2 Параметры одного метеора

| Параметр | Значение |
|---|---|
| Длина | 10–50% ширины экрана (псевдорандомно) |
| Ширина линии | 1.5px |
| Glow | `ctx.shadowBlur = 3; ctx.shadowColor = rgba(255,255,255,0.4)` |
| Яркость | 0.60–0.85 alpha (Tier 3 звёздный уровень) |
| Длительность | 200–700 мс |
| Вход | С боковой границы экрана (x=0 или x=width) |
| Y-позиция входа | Верхние 65% высоты экрана |
| Угол от вертикали | 60–90° (т.е. 0–30° от горизонтали, почти горизонтально) |
| Направление лево/право | Псевдорандомное |

**Профиль альфа по времени (progress 0→1):**
- 0–10%: fade-in (0 → maxAlpha)
- 10–80%: plateau (maxAlpha)
- 80–100%: fade-out (maxAlpha → 0)

**Хвост:** linear gradient `rgba(255,255,255,0)` → `rgba(255,255,255,α)`.
Длина хвоста нарастает до 30% от полной длины метеора, затем держится.

### 6.3 Метеорный дождь

| Параметр | Значение |
|---|---|
| Кластеров в потоке | 1–4 (псевдорандомно) |
| Метеоров в кластере | 5–40 (псевдорандомно) |
| Микрозадержка внутри кластера | 50–100 мс между метеорами |
| Пауза между кластерами | 1–5 сек (псевдорандомно) |
| Угол и направление потока | Общие для всех кластеров одного дождя |

**Ограничение:** max 60 активных метеоров одновременно (cap для деловой эстетики и производительности).

### 6.4 Расчёт траектории

```
angle = rand(60°, 90°) от вертикали = rand(0°, 30°) от горизонтали
direction = +1 (вправо) или -1 (влево), псевдорандомно

dx = direction × cos(angle_from_vertical)   // почти ±1
dy = sin(angle_from_vertical)               // 0–0.5 (вниз)

// Нормализация:
magnitude = sqrt(dx² + dy²)
dx /= magnitude
dy /= magnitude

startX = direction > 0 ? 0 : width
startY = rand(0, height * 0.65)
length  = rand(width * 0.10, width * 0.50)
```

### 6.5 Производительность

| Сценарий | CPU/кадр |
|---|---|
| Звёзды, 15fps | ~0.3 ms |
| Одиночный метеор, 60fps | +0.02 ms |
| Кластер 40 метеоров, 60fps | +0.8 ms |
| Теоретический максимум (cap 60) | ~1.2 ms |

Бюджет 16.7ms (60fps). Нагрузка в пике < 10%.

---

## 7. Инфографика /explore — dark-режим

### 7.1 Что НЕ меняется

`DIMENSION_COLORS.*.base / hover / selected` — насыщенные средние тона работают на тёмном фоне без изменений.

### 7.2 Что меняется

**Dimmed цвета (для cross-filter диммирования):**

| Измерение | Текущий (light) | Тёмный режим |
|---|---|---|
| year | `#bfdbfe` blue-200 | `#1e3a8a` blue-900 |
| country | `#bbf7d0` green-200 | `#14532d` green-900 |
| doc_type | `#ddd6fe` violet-200 | `#4c1d95` violet-900 |
| journal | `#fde68a` amber-200 | `#78350f` amber-900 |
| open_access | `#99f6e4` teal-200 | `#134e4a` teal-900 |
| author | `#bae6fd` sky-200 | `#0c4a6e` sky-900 |

**CartesianGrid:** `stroke="#e2e8f0"` (захардкожен) → theme-aware через hook.

**Архитектура:** `useDimensionColors(dimension)` хук читает `useTheme()` и возвращает нужный набор цветов. Recharts получает hex напрямую.

---

## 8. Аудит UI-элементов Header

| Элемент | Статус | Действие |
|---|---|---|
| Logo SVG | ✓ уже `dark:text-blue-500` | — |
| "Scopus Search" текст | ✓ `dark:text-slate-100` | — |
| "Sign in" кнопка | ✓ `dark:bg-blue-500` | — |
| Аватар-инициалы | ✓ `dark:bg-blue-500` | — |
| Navigation links | ✓ через CSS vars | — |
| Dropdown тексты | ✓ все `dark:` классы | — |
| **Фон шапки** | ✗ `dark:bg-slate-900/95` | → `dark:bg-[#0d1b2a]/95` |
| **Фон RootLayout** | ✗ `dark:bg-slate-900` | → `bg-background` |
| **Кнопки режима поиска** | ✗ `dark:bg-slate-900` | → `dark:bg-[#0d1b2a]` |

**Примечание:** backdrop-blur шапки + Canvas со звёздами = звёзды будут деликатно просвечивать через шапку. Эффект желателен, контрастность текста сохраняется.

---

## 9. Доступность

- `prefers-reduced-motion: reduce` → fade мгновенный, twinkling отключён, shooting stars отключены полностью
- `aria-label` на ThemeToggle кнопке: `"Switch to dark mode"` / `"Switch to light mode"`
- Контраст всех текстов в dark mode: WCAG AAA (≥7:1) за счёт `#0d1b2a` фона

---

## 10. Порядок реализации

Оптимальная последовательность строится по трём критериям:
**функциональные зависимости** (нельзя использовать хук до его создания) →
**риск регрессии** (чистые добавления раньше правок существующего кода) →
**ранняя проверяемость** (каждая фаза оставляет систему в рабочем состоянии).

### Фаза 1 — CSS-фундамент (нулевой риск)
`src/index.css` — обновить `.dark {}`: `--background #0d1b2a`, `--card #152236`.
Класс `.dark` не применён ни к чему — светлый режим не затронут вообще.

### Фаза 2 — Новые файлы темизации (нулевой риск, чистые добавления)
1. `src/components/theme/ThemeProvider.tsx` — контекст + overlay-менеджер
2. `src/hooks/useTheme.ts` — читает ThemeContext
3. `src/components/theme/ThemeToggle.tsx` — кнопка Moon/Sun

### Фаза 3 — Подключение темы в оболочку приложения (низкий риск)
4. `src/App.tsx` — обернуть в `<ThemeProvider>`, `bg-background` в RootLayout
5. `src/components/layout/Header.tsx` — добавить ThemeToggle, исправить `dark:bg-slate-900/95`
6. `src/pages/HomePage.tsx` — исправить `dark:bg-slate-900` в кнопках режима поиска

→ **Контрольная точка A:** переключатель тема работает end-to-end. Запустить `npm test`.

### Фаза 4 — Canvas-эффекты (нулевой риск регрессии существующих тестов)
7. `src/components/theme/StarFieldCanvas.tsx` — звёзды + shooting stars + scheduler
8. `src/App.tsx` (дополнение) — монтировать `<StarFieldCanvas>` внутри ThemeProvider

→ **Контрольная точка B:** визуальные эффекты работают в браузере. Ручное тестирование.

### Фаза 5 — Адаптация инфографики (наибольший риск — здесь тесты)
9. `src/components/charts/chartColors.ts` — добавить `darkDimmed` в каждый DIMENSION_COLORS
10. `src/hooks/useDimensionColors.ts` — новый хук; **ключевой инвариант:** без ThemeProvider (т.е. в тестах) возвращает светлые цвета — нулевая регрессия
11. `src/components/charts/ChartCard.tsx` — bg + useDimensionColors
12. `src/components/charts/ChartTooltip.tsx` — bg
13. `src/components/explore/KpiTile.tsx` — bg + useDimensionColors
14. `src/components/charts/PublicationsByYearChart.tsx` — CartesianGrid theme-aware + useDimensionColors

→ **Контрольная точка C:** полный прогон 270 тестов.

### Коммит-стратегия
| Коммит | Фазы | Тип |
|---|---|---|
| `feat: theme CSS variables and dark background` | 1 | feat |
| `feat: ThemeProvider, useTheme, ThemeToggle` | 2 | feat |
| `feat: wire theme into app shell and header` | 3 | feat |
| `feat: StarFieldCanvas — stars and shooting stars` | 4 | feat |
| `feat: chart dark mode — dimmed colors and CartesianGrid` | 5 | feat |

---

---

## 12. Статус выполнения

**Смерджен:** 2026-06-28, PR #33 (`feat/dark-mode` → `main`).

| Фаза | Статус | Ключевые коммиты |
|---|---|---|
| 1 — CSS-фундамент | ✓ | `9306623` |
| 2 — ThemeProvider, useTheme, ThemeToggle | ✓ | `3762575` |
| 3 — App shell, Header, HomePage | ✓ | `059730c` |
| 4 — StarFieldCanvas | ✓ | `5498064` |
| 5 — Chart adaptation (useDimensionColors) | ✓ | `ee920a7`, `3d9ce77` |
| Тесты (20 новых) | ✓ | `b3414af`, `f6805b5` |
| useDimensionColors тесты (14) | ✓ | `ee920a7` |

**После мерджа (прямо в main):**
- Тёмный режим по умолчанию для новых пользователей (`bf38159`)
- Клик по логотипу сбрасывает поиск и очищает SearchBar (`bcc3150`, `0c9345a`)

**Итог:** 270 → 332 тестов. Все CI зелёные. Spec выполнен полностью; отклонений нет.

**Вне scope (не запрашивалось):** DynamicChart dimmed в dark mode (cross-filter); per-page shooting star density tuning.

## 11. CI и ветка

- Ветка: `feat/dark-mode`
- Триггеры добавлены в: `frontend-tests.yml`, `tests.yml`, `e2e.yml`
- Бэкенд не затрагивается; backend CI запустится через `pull_request → main` при открытии PR
