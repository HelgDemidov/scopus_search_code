# ТЗ: Черногорский UI — sr-Latn с черногорским flavour

## Цель

Добавить третий язык интерфейса — сербскую латиницу (`sr-Latn`) с черногорской языковой
адаптацией (иекавица, черногорский вариант лексики) — для черногорской аудитории сайта
https://scopus-search-code.vercel.app/

## Техническое решение

**Locale-тег:** `sr-Latn` (стандартный IETF-тег с полной поддержкой CLDR).
**Plural-формы:** `_one / _few / _other` — три формы без `_many` (в отличие от `ru`).
**Черногорский flavour:** иекавица системно (`Njema-č-ka`, `bi-lješka`, `Norve-š-ka`);
«historija» вместо «istorija»; «sedmični» вместо «tjedni» и т.д.

## Что уже готово (инфраструктура PR #34)

- `react-i18next` + `i18next-browser-languagedetector` — добавить `'sr-Latn'` в `supportedLngs` (1 строка)
- TypeScript-типизация `i18next.d.ts` — изменений не требует
- Plural-система i18next поддерживает sr-Latn автоматически
- `MultiSelectCombobox.getDisplayLabel`, `ChartTooltip.translateTooltipLabel`, `getKpiLabel` switch — расширяются добавлением новой ветки
- CI parity-чек в `frontend-tests.yml` — расширяется для третьего языка

## Файлы к созданию / изменению

| Файл | Действие |
|---|---|
| `frontend/src/locales/sr-Latn/translation.json` | Создать (203 ключа; готовый черновик в `docs/montenegro-ui/script - sr-Latn with cn flavour.md`) |
| `frontend/src/i18n.ts` | +1 import + +1 resources entry + `'sr-Latn'` в `supportedLngs` |
| `frontend/src/constants/labelTranslations.ts` | +3 map (`COUNTRY_`, `DOC_TYPE_`, `OA_LABELS_SR_LATN`) + рефактор `translateDataLabel` |
| `frontend/src/components/layout/LanguageSwitcher.tsx` | +1 кнопка «CG» по образцу EN/RU |
| `frontend/src/i18n.test.ts` | +1 describe-блок sr-Latn + расширение parity-чека; переместить `flatKeys`/`enKeys` на уровень модуля |
| `.github/workflows/frontend-tests.yml` | Расширить CI parity-скрипт (EN ↔ SR-LATN) + триггер ветки |

## Пошаговый план работ

### Шаг 1 — Locale JSON

Создать `frontend/src/locales/sr-Latn/translation.json` на основе черновика из
`docs/multilingual-ui/montenegro-ui/script - sr-Latn with cn flavour.md`.

**Обязательные исправления при переносе из черновика:**
- 3× сломанный тег: заменить `nk>текст</lnk>` → `<lnk>текст</lnk>` в ключах:
  `home.anonSubtitle`, `home.anonNote`, `explore.emptyPersonal`

### Шаг 2 — `i18n.ts`

```typescript
import srLatn from './locales/sr-Latn/translation.json';

// в resources:
'sr-Latn': { translation: srLatn },

// в supportedLngs:
supportedLngs: ['en', 'ru', 'sr-Latn'],
```

### Шаг 3 — `labelTranslations.ts`

Добавить три экспортируемые карты (`COUNTRY_TRANSLATIONS_SR_LATN`, `DOC_TYPE_TRANSLATIONS_SR_LATN`,
`OA_LABELS_SR_LATN`) из черновика скрипта.

Рефакторить `translateDataLabel` — убрать хардкод `lang === 'ru'`:
```typescript
const TRANSLATED_LANGS = new Set(['ru', 'sr-Latn']);
export function translateDataLabel(label: string, lang: string, map: Record<string, string>): string {
  return TRANSLATED_LANGS.has(lang) ? (map[label] ?? label) : label;
}
```

### Шаг 4 — `LanguageSwitcher.tsx`

Добавить третью кнопку `CG` по образцу существующих `EN` / `RU`.
Метка кнопки: `CG` (черногорский). aria-label: `'sr-Latn'`.

### Шаг 5 — Тестирование: `i18n.test.ts`

**5a.** Переместить `flatKeys` и `const enKeys` на уровень модуля (до первого `describe`).

**5b.** Добавить describe-блок sr-Latn по образцу RU-блока (см. черновик).
Исправить баг черновика в plural-тесте для count=21:
```typescript
// НЕВЕРНО (из черновика):
expect(i18n.t('articles.resultsCount', { count: 21 })).toBe('1 rezultat');
// ВЕРНО:
expect(i18n.t('articles.resultsCount', { count: 21 })).toBe('21 rezultat');
```

**5c.** Добавить parity-чек describe `EN ↔ SR-LATN` — исключить `['_few', '_many']`
(sr-Latn не использует `_many`, EN не использует `_few`).

### Шаг 6 — Расширить компоненты, использующие `lang === 'ru'` хардкоды

Места (~6 вхождений), где нужно добавить `sr-Latn` рядом с `ru`:
- `ArticleFilters.tsx` — `getDisplayLabel` (передача карты переводов)
- `ChartTooltip.tsx` — `translateTooltipLabel`
- `KpiRow.tsx` — `getKpiLabel` switch (добавить case `'sr-Latn'`)
- `DrawerOAChart.tsx` — перевод OA-меток

Вместо цепочки `lang === 'ru' || lang === 'sr-Latn'` использовать
`TRANSLATED_LANGS.has(lang)` с импортом из `labelTranslations.ts`.

### Шаг 7 — CI адаптация

В `.github/workflows/frontend-tests.yml`, в шаге `Check translation key parity (EN ↔ RU)`:
- Переименовать шаг в `Check translation key parity (EN ↔ RU ↔ SR-LATN)`
- Добавить блок проверки EN ↔ SR-LATN (аналогичная логика; исключить `['_few','_many']`)

### Шаг 8 — Финальная проверка

```bash
cd frontend && npm run test          # все тесты зелёные (ожидается ~360+)
npm run lint                         # ESLint 0 warnings
npm run build                        # Vite production build без ошибок
npx tsc --noEmit                     # TypeScript без ошибок
```

## Критерии приёмки (DoD)

- [ ] Все frontend-тесты зелёные; кол-во тестов ≥ 357 + новые sr-Latn тесты
- [ ] Parity-чек EN ↔ SR-LATN проходит в CI и локально
- [ ] Переключатель языка отображает три кнопки: EN / RU / CG
- [ ] Все `<lnk>` ссылки рендерятся корректно в черногорском UI
- [ ] `translateDataLabel` работает корректно для sr-Latn (графики переведены)
- [ ] Нет хардкодов `lang === 'sr-Latn'` в компонентах (только через `TRANSLATED_LANGS`)
- [ ] ESLint --max-warnings 0, TypeScript без ошибок, Vite build OK

## Источники

- Черновик перевода и карт: `docs/multilingual-ui/montenegro-ui/script - sr-Latn with cn flavour.md`
- Инфраструктура i18n: `docs/multilingual-ui/russian-ui/spec.md`
- Текущий i18n.test.ts: `frontend/src/i18n.test.ts`
