# ТЗ: Русскоязычный UI и кнопка переключения языков

**Ветка:** `russian-UI`  
**Дата:** 2026-06-28  
**Статус:** В работе

---

## 1. Цель и контекст

Добавить поддержку русского языка в React SPA (Vite + TypeScript + shadcn/ui).  
Английский остаётся языком по умолчанию при первом посещении. Пользователь явно переключает язык кнопкой в шапке; выбор сохраняется в `localStorage`.

Фича реализуется как самодостаточная: архитектура должна тривиально допускать добавление третьего языка (черногорский / `cnr`) без рефакторинга.

---

## 2. Анализ рисков и специфика русского UX

### 2.1 Лексические и грамматические риски

| Риск | Проявление | Решение |
|---|---|---|
| **Падежная система** | "5 результатов" / "1 результат" / "3 результата" | `i18next` plural rules для `ru` (3 формы: `_one`, `_few`, `_many`) |
| **Длина строк** | Русские слова в среднем на 20–30% длиннее английских | Проверить UI на переполнение в мобильных breakpoint-ах; особенно Header, фильтры, KPI-тайлы |
| **Технический лексикон** | "DOI", "Open Access", "Scopus" — не переводятся | Явно помечены как NOT_TRANSLATED в словаре |
| **Переключение в форматах дат** | `toLocaleDateString('en-US', ...)` хардкодит локаль | Заменить на `toLocaleDateString(i18n.language, ...)` или Intl с динамической локалью |
| **Кириллица в шрифте** | Inter (текущий) поддерживает кириллицу в Google Fonts subset | Проверить, что Vite/Vercel загружает `subset=cyrillic`; при необходимости добавить |
| **Zod validation messages** | Зодовые схемы компилируются статически | Строки валидации переводятся в JSON; форма рендерит `t('auth.errors.passwordMin')` вместо хардкода |

### 2.2 UX-риски

- **Переключение не меняет язык поискового запроса** — важно: поиск работает на английском (Scopus CQL), смена языка касается только интерфейса, не запросов.
- **lang attribute на `<html>`** — нужно обновлять при смене языка (`document.documentElement.lang = lang`), иначе screen readers читают русский текст с неправильной просодикой.
- **SEO** — SPA без SSR, поэтому meta hreflang для `ru` / `en` добавлять не нужно (Vercel деплоит статику без серверного рендера).

---

## 3. Технологический стек i18n

### 3.1 Библиотека

**`react-i18next` v15 + `i18next` v24** — де-факто стандарт для React.

```bash
npm install react-i18next i18next i18next-browser-languagedetector
```

**Почему не альтернативы:**
- `react-intl` (Format.js) — тяжелее, избыточен для проекта такого масштаба
- `lingui` — требует отдельного CLI и шага компиляции
- `next-intl` — заточен под Next.js, не подходит для Vite SPA

### 3.2 Структура файлов

```
frontend/
├── public/
│   └── locales/
│       ├── en/
│       │   └── translation.json   # эталонный словарь EN
│       └── ru/
│           └── translation.json   # перевод RU
└── src/
    ├── i18n.ts                    # конфигурация i18next
    └── components/
        └── layout/
            └── LanguageSwitcher.tsx
```

Один namespace (`translation`) — достаточно для текущего масштаба. При добавлении 3-го языка структура не меняется.

### 3.3 Конфигурация `i18n.ts`

```typescript
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from '../public/locales/en/translation.json';
import ru from '../public/locales/ru/translation.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, ru: { translation: ru } },
    fallbackLng: 'en',
    supportedLngs: ['en', 'ru'],
    detection: {
      order: ['localStorage', 'navigator'],  // localStorage выше браузерного: явный выбор имеет приоритет
      caches: ['localStorage'],
      lookupLocalStorage: 'i18n_lang',
    },
    interpolation: { escapeValue: false },   // React уже экранирует XSS
  });

export default i18n;
```

**Детектор:** первый приоритет — `localStorage` (сохранённый выбор пользователя). Если ничего нет — `navigator.language` (`ru-RU` → `ru`). Если браузер ни EN ни RU — `fallbackLng: 'en'`.

### 3.4 Плюрализация для русского

i18next реализует Unicode CLDR plural rules. Для `ru`:

```json
{
  "articleCount_one":  "{{count}} результат",
  "articleCount_few":  "{{count}} результата",
  "articleCount_many": "{{count}} результатов"
}
```

```tsx
t('articleCount', { count: 42 }) // → "42 результата"
```

Аналогично для: `results`, `selected`, `searches`, `citations`.

---

## 4. Компонент LanguageSwitcher

### 4.1 Размещение

Компонент размещается в `Header.tsx` между `ThemeToggle` и `NavigationMenu` — симметрично с тем же весом в визуальной иерархии.

```
[Logo]     [ThemeToggle] [LanguageSwitcher] [Nav] [Sign in / Avatar]
```

### 4.2 Дизайн

Кнопка-переключатель с двумя состояниями: **EN** / **РУ**.  
Визуальный паттерн — точно такой же toggle, что и ThemeToggle: `rounded-md`, `text-slate-500`, `hover:bg-slate-100 dark:hover:bg-slate-800`.

```tsx
// Схематично:
<button
  aria-label={t('a11y.switchLanguage')}
  onClick={toggleLanguage}
  className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-slate-500
             hover:bg-slate-100 hover:text-slate-900
             dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100
             transition-colors"
>
  {i18n.language === 'ru' ? 'EN' : 'РУ'}
</button>
```

**Логика:** клик переключает на противоположный язык и вызывает `i18n.changeLanguage(next)` — библиотека сама обновляет `localStorage` через детектор.

**Обновление `<html lang>`:**
```tsx
useEffect(() => {
  document.documentElement.lang = i18n.language;
}, [i18n.language]);
```

Этот эффект размещается один раз в `App.tsx` (не в LanguageSwitcher).

### 4.3 Мобильная адаптация

На мобильных (< 640px) Header уже содержит ThemeToggle + Navigation. LanguageSwitcher встаёт вплотную к ThemeToggle — оба компактны (text-xs), в ряду не переполняет.

---

## 5. Полный список строк для перевода

### 5.1 Группировка по ключам JSON

Ниже — контракт словаря. Русские переводы указаны для каждой строки.

#### `nav` — навигация (Header)
```json
{
  "nav": {
    "explore":  { "en": "Explore",  "ru": "Аналитика" },
    "profile":  { "en": "Profile",  "ru": "Профиль" },
    "signIn":   { "en": "Sign in",  "ru": "Войти" },
    "signOut":  { "en": "Sign out", "ru": "Выйти" }
  }
}
```

#### `home` — главная страница
```json
{
  "home": {
    "anonTitle":     { "en": "Search Scopus Publications", "ru": "Поиск публикаций Scopus" },
    "anonSubtitle":  { "en": "Preview results below.", "ru": "Просмотр результатов ниже." },
    "anonCta":       { "en": "Sign in", "ru": "Войдите" },
    "anonCtaSuffix": { "en": "for full search access.", "ru": "для полного доступа к поиску." },
    "anonNote":      {
      "en": "Unauthenticated search is scoped to the thematic collection \"Artificial Intelligence and Neural Network Technologies\". To search the global Scopus database, please sign in.",
      "ru": "Поиск без авторизации ограничен тематической коллекцией «Искусственный интеллект и технологии нейронных сетей». Для поиска по глобальной базе Scopus необходимо войти."
    },
    "modeScopus":   { "en": "Search Scopus Database", "ru": "Поиск по базе Scopus" },
    "modeCatalog":  { "en": "Search AI & Neural Network Technologies Collection", "ru": "Поиск по коллекции ИИ и нейросетей" },
    "errorQuota":   { "en": "Weekly search quota exceeded", "ru": "Недельный лимит поиска исчерпан" },
    "errorGeneric": { "en": "Search error: {{error}}", "ru": "Ошибка поиска: {{error}}" }
  }
}
```

#### `articles` — карточки, список, фильтры
```json
{
  "articles": {
    "openAccess":    { "en": "Open Access", "ru": "Открытый доступ" },
    "cited":         { "en": "Cited: {{count}}", "ru": "Цитирований: {{count}}" },
    "resultsCount_one":  { "en": "{{count}} result",  "ru": "{{count}} результат" },
    "resultsCount_few":  { "en": "{{count}} results", "ru": "{{count}} результата" },
    "resultsCount_many": { "en": "{{count}} results", "ru": "{{count}} результатов" },
    "noResults":     { "en": "No articles found. Try a different search query.", "ru": "Статьи не найдены. Попробуйте изменить запрос." },
    "sortByDate":    { "en": "By date",      "ru": "По дате" },
    "sortByCit":     { "en": "By citations", "ru": "По цитированиям" },
    "selectedCount_one":  { "en": "{{count}} selected", "ru": "{{count}} выбран" },
    "selectedCount_few":  { "en": "{{count}} selected", "ru": "{{count}} выбрано" },
    "selectedCount_many": { "en": "{{count}} selected", "ru": "{{count}} выбрано" }
  },
  "filters": {
    "allTypes":        { "en": "All types",    "ru": "Все типы" },
    "searchType":      { "en": "Search type…", "ru": "Тип…" },
    "docTypeLabel":    { "en": "Document type filter", "ru": "Фильтр по типу документа" },
    "openAccessOnly":  { "en": "Open Access only", "ru": "Только открытый доступ" },
    "allCountries":    { "en": "All countries",    "ru": "Все страны" },
    "searchCountry":   { "en": "Search country…", "ru": "Страна…" },
    "countryLabel":    { "en": "Country filter",   "ru": "Фильтр по стране" },
    "yearFrom":        { "en": "Year from", "ru": "Год от" },
    "yearTo":          { "en": "Year to",   "ru": "Год до" },
    "filtersButton":   { "en": "Filters",   "ru": "Фильтры" },
    "noResults":       { "en": "No results found", "ru": "Ничего не найдено" },
    "apply":           { "en": "Apply",     "ru": "Применить" },
    "clear":           { "en": "Clear",     "ru": "Сбросить" }
  }
}
```

#### `pagination` — навигация по страницам
```json
{
  "pagination": {
    "prev":      { "en": "← Prev",   "ru": "← Пред." },
    "next":      { "en": "Next →",   "ru": "След. →" },
    "prevPage":  { "en": "Previous page", "ru": "Предыдущая страница" },
    "nextPage":  { "en": "Next page",     "ru": "Следующая страница" },
    "perPage":   { "en": "Per page:",     "ru": "На странице:" },
    "showing":   { "en": "Showing {{from}}–{{to}} of {{total}}", "ru": "Показано {{from}}–{{to}} из {{total}}" },
    "show":      { "en": "Show:",         "ru": "Показать:" },
    "perPageN":  { "en": "{{n}} per page", "ru": "По {{n}}" },
    "all":       { "en": "All ({{total}})", "ru": "Все ({{total}})" },
    "pageNav":   { "en": "Page navigation",  "ru": "Навигация по страницам" },
    "pages":     { "en": "Pages",            "ru": "Страницы" },
    "rowsPerPage": { "en": "Rows per page",  "ru": "Строк на странице" },
    "displayMode": { "en": "Display mode",   "ru": "Режим отображения" }
  }
}
```

#### `auth` — страница авторизации и формы
```json
{
  "auth": {
    "pageTitle":    { "en": "Welcome to Scopus Search", "ru": "Добро пожаловать в Scopus Search" },
    "pageSubtitle": { "en": "Sign in to access live Scopus search", "ru": "Войдите для доступа к живому поиску Scopus" },
    "googleFailed": { "en": "Google sign-in failed. Please try again.", "ru": "Вход через Google не удался. Попробуйте ещё раз." },
    "continueGoogle": { "en": "Continue with Google", "ru": "Войти через Google" },
    "tabSignIn":    { "en": "Sign in",  "ru": "Войти" },
    "tabRegister":  { "en": "Register", "ru": "Регистрация" },
    "labelEmail":   { "en": "Email",    "ru": "Email" },
    "labelPassword":{ "en": "Password", "ru": "Пароль" },
    "labelUsername":{ "en": "Username", "ru": "Имя пользователя" },
    "labelConfirm": { "en": "Confirm password", "ru": "Подтвердите пароль" },
    "forgotPassword":{ "en": "Forgot password?", "ru": "Забыли пароль?" },
    "btnSignIn":    { "en": "Sign in",         "ru": "Войти" },
    "btnSigningIn": { "en": "Signing in…",     "ru": "Входим…" },
    "btnCreate":    { "en": "Create account",  "ru": "Создать аккаунт" },
    "btnCreating":  { "en": "Creating account…", "ru": "Создаём…" },
    "showPassword": { "en": "Show password", "ru": "Показать пароль" },
    "hidePassword": { "en": "Hide password", "ru": "Скрыть пароль" },
    "errors": {
      "invalidEmail":    { "en": "Invalid email address",    "ru": "Неверный формат email" },
      "passwordRequired":{ "en": "Password is required",    "ru": "Пароль обязателен" },
      "usernameMin":     { "en": "Username must be at least 2 characters", "ru": "Минимум 2 символа" },
      "passwordMin":     { "en": "Minimum 8 characters",    "ru": "Минимум 8 символов" },
      "passwordUpper":   { "en": "At least one uppercase letter required", "ru": "Нужна хотя бы одна заглавная буква" },
      "passwordLower":   { "en": "At least one lowercase letter required", "ru": "Нужна хотя бы одна строчная буква" },
      "passwordDigit":   { "en": "At least one digit required", "ru": "Нужна хотя бы одна цифра" },
      "passwordSpecial": { "en": "At least one special character required (!@#$%^&* etc.)", "ru": "Нужен хотя бы один спецсимвол (!@#$%^&* и т.д.)" },
      "confirmRequired": { "en": "Please confirm your password", "ru": "Подтвердите пароль" },
      "passwordsMismatch":{ "en": "Passwords do not match", "ru": "Пароли не совпадают" },
      "invalidCredentials": { "en": "Invalid email or password", "ru": "Неверный email или пароль" },
      "serverError":     { "en": "Server error. Please try again.", "ru": "Ошибка сервера. Попробуйте ещё раз." },
      "emailExists":     { "en": "An account with this email already exists", "ru": "Аккаунт с этим email уже существует" },
      "checkFields":     { "en": "Please check that all fields are filled in correctly", "ru": "Проверьте правильность заполнения всех полей" }
    }
  }
}
```

#### `forgotPassword` — восстановление пароля
```json
{
  "forgotPassword": {
    "checkEmailTitle":   { "en": "Check your email",   "ru": "Проверьте почту" },
    "checkEmailBody":    { "en": "If this address is registered, you'll receive a reset link shortly.", "ru": "Если этот адрес зарегистрирован, вы получите ссылку для сброса пароля." },
    "backToSignIn":      { "en": "Back to sign in",    "ru": "Назад к входу" },
    "title":             { "en": "Reset your password", "ru": "Сброс пароля" },
    "subtitle":          { "en": "Enter your email and we'll send you a reset link.", "ru": "Введите email — мы пришлём ссылку для сброса." },
    "btnSend":           { "en": "Send reset link",    "ru": "Отправить ссылку" },
    "btnSending":        { "en": "Sending…",           "ru": "Отправляем…" }
  }
}
```

#### `resetPassword` — установка нового пароля
```json
{
  "resetPassword": {
    "invalidLink":       { "en": "Invalid or missing reset link.", "ru": "Недействительная или отсутствующая ссылка сброса." },
    "requestNew":        { "en": "Request a new reset link", "ru": "Запросить новую ссылку" },
    "title":             { "en": "Set new password",    "ru": "Новый пароль" },
    "subtitle":          { "en": "Choose a strong password for your account.", "ru": "Выберите надёжный пароль для вашего аккаунта." },
    "labelNew":          { "en": "New password",        "ru": "Новый пароль" },
    "labelConfirm":      { "en": "Confirm new password","ru": "Подтвердите пароль" },
    "btnUpdate":         { "en": "Update password",     "ru": "Сохранить пароль" },
    "btnUpdating":       { "en": "Updating…",           "ru": "Сохраняем…" },
    "successToast":      { "en": "Password updated. Please sign in.", "ru": "Пароль обновлён. Войдите в систему." },
    "linkExpired":       { "en": "This reset link is invalid or has expired.", "ru": "Ссылка недействительна или устарела." }
  }
}
```

#### `profile` — страница профиля
```json
{
  "profile": {
    "title":       { "en": "Profile",      "ru": "Профиль" },
    "username":    { "en": "Username",     "ru": "Имя пользователя" },
    "email":       { "en": "Email",        "ru": "Email" },
    "memberSince": { "en": "Member since", "ru": "Участник с" },
    "signOut":     { "en": "Sign out",     "ru": "Выйти" },
    "quota": {
      "title":  { "en": "Scopus Live Search — Weekly Quota", "ru": "Живой поиск Scopus — недельная квота" },
      "used":   { "en": "Used",    "ru": "Использовано" },
      "resetsOn": { "en": "Resets on {{date}}", "ru": "Обновится {{date}}" }
    },
    "history": {
      "title":       { "en": "Search History",     "ru": "История поиска" },
      "refresh":     { "en": "Refresh",            "ru": "Обновить" },
      "empty":       { "en": "No search history yet", "ru": "История поиска пуста" },
      "available":   { "en": "Available",          "ru": "Доступно" },
      "noResults":   { "en": "No results",         "ru": "Нет результатов" },
      "resultCount_one":  { "en": "{{count}} result",  "ru": "{{count}} результат" },
      "resultCount_few":  { "en": "{{count}} results", "ru": "{{count}} результата" },
      "resultCount_many": { "en": "{{count}} results", "ru": "{{count}} результатов" },
      "prevPage":    { "en": "Previous page", "ru": "Предыдущая страница" },
      "nextPage":    { "en": "Next page",     "ru": "Следующая страница" }
    }
  }
}
```

#### `explore` — страница аналитики
```json
{
  "explore": {
    "title":           { "en": "Collection Analytics",  "ru": "Аналитика коллекции" },
    "subtitlePersonal":{ "en": "Statistics from your own live searches.", "ru": "Статистика по вашим живым поискам." },
    "subtitleCollection": { "en": "AI & Neural Network Technologies — DOI-indexed articles only.", "ru": "ИИ и технологии нейросетей — только статьи с DOI." },
    "modeCollection":  { "en": "Collection",  "ru": "Коллекция" },
    "modePersonal":    { "en": "My searches", "ru": "Мои поиски" },
    "modeLabel":       { "en": "Analytics mode", "ru": "Режим аналитики" },
    "emptyPersonal":   { "en": "No search history yet.", "ru": "История поиска пуста." },
    "startSearching":  { "en": "Start searching", "ru": "Начните поиск" },
    "emptyPersonalSuffix": { "en": "to see your personal analytics.", "ru": "чтобы увидеть личную аналитику." },
    "anonCta":         { "en": "Sign in to search Scopus live and see analytics based on your own queries.", "ru": "Войдите, чтобы искать по Scopus и видеть аналитику по своим запросам." },
    "chartsError":     { "en": "Charts failed to load.", "ru": "Не удалось загрузить графики." },
    "reloadPage":      { "en": "Reload page", "ru": "Перезагрузить страницу" },
    "kpi": {
      "articlesIndexed": { "en": "Articles indexed", "ru": "Статей в индексе" },
      "countries":       { "en": "Countries",         "ru": "Стран" },
      "openAccess":      { "en": "Open Access",        "ru": "Открытый доступ" },
      "docTypes":        { "en": "Document types",     "ru": "Типов документов" },
      "journals":        { "en": "Journals",           "ru": "Журналов" },
      "authors":         { "en": "Authors",            "ru": "Авторов" }
    },
    "chartBuilder": {
      "addChart":   { "en": "Add chart",   "ru": "Добавить график" },
      "cancel":     { "en": "Cancel",      "ru": "Отмена" },
      "add":        { "en": "Add",         "ru": "Добавить" },
      "dimension":  { "en": "Dimension",   "ru": "Измерение" },
      "chartType":  { "en": "Chart type",  "ru": "Тип графика" }
    },
    "dimensions": {
      "year":        { "en": "Publications by Year", "ru": "Публикации по годам" },
      "country":     { "en": "Countries",            "ru": "Страны" },
      "doc_type":    { "en": "Document Types",       "ru": "Типы документов" },
      "journal":     { "en": "Journals",             "ru": "Журналы" },
      "open_access": { "en": "Open Access",          "ru": "Открытый доступ" },
      "author":      { "en": "Authors",              "ru": "Авторы" }
    },
    "chartTypes": {
      "bar_h": { "en": "Horizontal bar", "ru": "Горизонтальный столбик" },
      "bar_v": { "en": "Vertical bar",   "ru": "Вертикальный столбик" },
      "pie":   { "en": "Pie chart",      "ru": "Круговая диаграмма" },
      "line":  { "en": "Line chart",     "ru": "Линейный график" },
      "table": { "en": "Table",          "ru": "Таблица" }
    }
  }
}
```

#### `article` — страница детальной статьи
```json
{
  "article": {
    "backHome":    { "en": "← Back to home",       "ru": "← На главную" },
    "notFound":    { "en": "Article not found",    "ru": "Статья не найдена" },
    "notFoundSub": { "en": "The article may have been removed or the URL is incorrect.", "ru": "Статья могла быть удалена или URL некорректен." },
    "metaAuthor":  { "en": "Author",      "ru": "Автор" },
    "metaJournal": { "en": "Journal",     "ru": "Журнал" },
    "metaDate":    { "en": "Date",        "ru": "Дата" },
    "metaCountry": { "en": "Country",     "ru": "Страна" },
    "metaCitations":{ "en": "Citations",  "ru": "Цитирований" },
    "metaDoi":     { "en": "DOI",         "ru": "DOI" }
  }
}
```

#### `a11y` — aria-labels и accessibility
```json
{
  "a11y": {
    "switchLanguage": { "en": "Switch language", "ru": "Сменить язык" },
    "userMenu":       { "en": "User menu for {{name}}", "ru": "Меню пользователя {{name}}" },
    "searchMode":     { "en": "Search mode",   "ru": "Режим поиска" },
    "refreshHistory": { "en": "Refresh search history", "ru": "Обновить историю поиска" }
  }
}
```

### 5.2 Строки, которые НЕ переводятся (NOT_TRANSLATED)

| Строка | Причина |
|---|---|
| `"Scopus Search"` (логотип, заголовки) | Бренд |
| `"Scopus"` | Бренд |
| `"DOI"` | Технический стандарт |
| `"Open Access"` (badge) | Международный термин, широко узнаваем по-русски |
| Имена авторов, журналов, стран | Данные из БД, не UI-строки |
| `"Google"` в кнопке OAuth | Бренд |
| Placeholder email: `you@example.com` | Технический формат |

> **Примечание по "Open Access":** Badge `ArticleCard` и KPI-тайл используют этот термин. В академической и технической среде "Open Access" понятен по-русски без перевода. Однако это открытый вопрос — см. §8.

### 5.3 Форматирование дат по локали

Все вызовы `toLocaleDateString` и `Intl.DateTimeFormat` с хардкодным `'en-US'` заменяются на динамическую локаль:

```typescript
// Было:
new Date(iso).toLocaleDateString('en-US', { ... })

// Стало (в компоненте с доступом к i18n):
import { useTranslation } from 'react-i18next';
const { i18n } = useTranslation();
new Date(iso).toLocaleDateString(i18n.language, { ... })
```

Затронутые файлы:
- `ArticleCard.tsx` → `formatDate()`
- `ProfilePage.tsx` → `formatDate()`
- `LiveSearchQuotaCounter.tsx` → `Intl.DateTimeFormat`
- `SearchHistoryList.tsx` → `formatDate()`

---

## 6. Зависимости, затронутые файлы и план изменений

### 6.1 Новые файлы

| Файл | Назначение |
|---|---|
| `frontend/src/i18n.ts` | Конфигурация i18next |
| `frontend/src/components/layout/LanguageSwitcher.tsx` | Кнопка переключения |
| `frontend/public/locales/en/translation.json` | Словарь EN |
| `frontend/public/locales/ru/translation.json` | Словарь RU |
| `frontend/src/components/layout/LanguageSwitcher.test.tsx` | Unit-тест компонента |
| `frontend/src/i18n.test.ts` | Тест полноты ключей словарей |

### 6.2 Изменяемые файлы

| Файл | Изменения |
|---|---|
| `frontend/src/main.tsx` | `import './i18n'` до рендера App |
| `frontend/src/App.tsx` | `useEffect` → обновление `document.documentElement.lang` |
| `frontend/src/components/layout/Header.tsx` | Добавить `<LanguageSwitcher />`, обернуть строки в `t()` |
| `frontend/src/pages/HomePage.tsx` | `t()` для всех UI-строк |
| `frontend/src/pages/AuthPage.tsx` | `t()` + Zod-схемы читают строки из `t()` через фабрику |
| `frontend/src/pages/ForgotPasswordPage.tsx` | `t()` |
| `frontend/src/pages/ResetPasswordPage.tsx` | `t()` |
| `frontend/src/pages/ProfilePage.tsx` | `t()` + дата-форматирование |
| `frontend/src/pages/ArticlePage.tsx` | `t()` + дата-форматирование |
| `frontend/src/pages/ExplorePage.tsx` | `t()` |
| `frontend/src/components/articles/ArticleCard.tsx` | `t()` + дата-форматирование |
| `frontend/src/components/articles/ArticleList.tsx` | `t()` |
| `frontend/src/components/articles/ArticleFilters.tsx` | `t()` |
| `frontend/src/components/articles/PaginationBar.tsx` | `t()` |
| `frontend/src/components/articles/ScopusPaginationBar.tsx` | `t()` |
| `frontend/src/components/explore/KpiRow.tsx` | Метки тайлов через `t()` |
| `frontend/src/components/explore/ChartBuilderPanel.tsx` | `t()` |
| `frontend/src/components/profile/LiveSearchQuotaCounter.tsx` | `t()` + Intl |
| `frontend/src/components/profile/SearchHistoryList.tsx` | `t()` + Intl |
| `frontend/src/components/charts/chartColors.ts` | label-поля убираются или дублируются через t() |
| `frontend/vite.config.ts` | Убедиться, что `public/locales` не исключены из build |

### 6.3 Обработка Zod validation messages

Zod-схемы в AuthPage/ResetPasswordPage содержат хардкодные строки сообщений.  
Подход: вынести схемы в функцию-фабрику, принимающую `t`:

```typescript
// Пример:
function makeLoginSchema(t: TFunction) {
  return z.object({
    email: z.string().email(t('auth.errors.invalidEmail')),
    password: z.string().min(1, t('auth.errors.passwordRequired')),
  });
}

// В компоненте:
const { t } = useTranslation();
const schema = useMemo(() => makeLoginSchema(t), [t]);
const { ... } = useForm({ resolver: zodResolver(schema) });
```

`useMemo` гарантирует пересоздание схемы при смене языка.

---

## 7. Тестовое покрытие

### 7.1 Unit-тесты

**`LanguageSwitcher.test.tsx`** — 4 кейса:
1. Рендерится и показывает `РУ` когда язык `en`
2. Клик переключает на `ru` и показывает `EN`
3. После смены языка `i18next.language` === `'ru'`
4. `localStorage` содержит `'ru'` после переключения

**`i18n.test.ts`** — проверка полноты словарей:
1. Все ключи из `en/translation.json` присутствуют в `ru/translation.json` (deep equality of key sets)
2. Нет лишних ключей в RU относительно EN
3. Ни одно значение в RU словаре не является пустой строкой

**Компонентные тесты (для каждого затронутого компонента):**
- Компонент рендерится с русской строкой, когда `i18n.language === 'ru'`
- Применяется паттерн из `feedback_vitest_testing_patterns.md`: `vi.hoisted` для мутируемого состояния, `vi.stubGlobal` для localStorage

Пример для `Header.test.tsx`:
```tsx
import { vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n';

// Переключаем язык перед тестом
beforeEach(() => i18n.changeLanguage('ru'));
afterEach(() => i18n.changeLanguage('en'));

it('показывает "Войти" на русском', () => {
  render(<I18nextProvider i18n={i18n}><Header /></I18nextProvider>);
  expect(screen.getByText('Войти')).toBeInTheDocument();
});
```

### 7.2 Интеграционные тесты

**`LanguageSwitcher.integration.test.tsx`** — 2 кейса:
1. Переключение языка в Header меняет текст навигации в Header (проверяет, что React re-render работает глобально)
2. После `window.localStorage.setItem('i18n_lang', 'ru')` + перерендер — приложение стартует на русском

### 7.3 Проверка полноты ключей в CI

Добавить шаг `i18n key check` в job `lint` в `frontend-tests.yml`:

```yaml
- name: Check i18n key completeness
  run: |
    node -e "
      const en = require('./public/locales/en/translation.json');
      const ru = require('./public/locales/ru/translation.json');
      
      function getKeys(obj, prefix = '') {
        return Object.entries(obj).flatMap(([k, v]) =>
          typeof v === 'object' && v !== null
            ? getKeys(v, prefix ? prefix + '.' + k : k)
            : [prefix ? prefix + '.' + k : k]
        );
      }
      
      const enKeys = new Set(getKeys(en));
      const ruKeys = new Set(getKeys(ru));
      
      const missing = [...enKeys].filter(k => !ruKeys.has(k));
      const extra   = [...ruKeys].filter(k => !enKeys.has(k));
      
      if (missing.length || extra.length) {
        if (missing.length) console.error('Missing in RU:', missing.join(', '));
        if (extra.length)   console.error('Extra in RU:',   extra.join(', '));
        process.exit(1);
      }
      console.log('✓ i18n keys match:', enKeys.size, 'keys');
    "
  working-directory: frontend
```

### 7.4 Интеграция в Coverage

Новые тесты автоматически учитываются в существующем Coverage CI-джобе (`integration` job → `npx vitest run --coverage`). Порог `statements=70%` остаётся неизменным; добавление тестов только увеличивает coverage.

Рекомендация: после завершения фичи проверить что coverage не упал (ожидается рост из-за новых тестов для LanguageSwitcher и i18n).

---

## 8. Решения по открытым вопросам

> Зафиксировано 2026-06-28 после согласования с владельцем проекта.

### OQ-1: "Open Access" — **НЕ переводить** ✓

Оставить "Open Access" без перевода на обоих языках. Международный стандартный термин, широко узнаваем в академической среде. Затронутые места: badge в `ArticleCard`, KPI-тайл, label в filters — везде остаётся "Open Access".

### OQ-2: Авто-детект языка браузера — **включить** ✓

`i18next-browser-languagedetector` с порядком `['localStorage', 'navigator']`. Пользователи с русскоязычным браузером (`ru`, `ru-RU`) видят сайт на русском при первом посещении. Ручной выбор сохраняется в `localStorage` и имеет приоритет при последующих визитах.

### OQ-3: Zod validation messages — **переводить полностью** ✓

Zod-схемы рефакторятся в фабричные функции, принимающие `t: TFunction`. Схема пересоздаётся через `useMemo([t])` при смене языка. Добавляются тест-кейсы для валидации на русском.

### OQ-4: TypeScript типизация ключей — **включить** ✓

`src/i18next.d.ts` декларирует `CustomTypeOptions` с `typeof enTranslation`. Для этого добавлен `"resolveJsonModule": true` в `tsconfig.json`. Ложные срабатывания компилятора при несуществующих ключах становятся ошибками CI (`typecheck` job).

### OQ-5: Locale-aware date format — **автоматическое переключение** ✓

Все вызовы `toLocaleDateString('en-US', ...)` и `Intl.DateTimeFormat('en-US', ...)` заменяются на `i18n.language`. В русской локали даты отображаются в формате "02 июня 2026 г." (Intl стандарт для `ru`).

---

## 9. CI-интеграция

### 9.1 Обновление пуш-триггеров

Добавить ветку `russian-UI` в `on.push.branches` всех трёх воркфлоу:
- `.github/workflows/frontend-tests.yml`
- `.github/workflows/tests.yml`
- `.github/workflows/e2e.yml`

### 9.2 Новые шаги в `frontend-tests.yml`

В job `lint` добавить шаг `Check i18n key completeness` (скрипт из §7.3) — после `npm ci`.

### 9.3 TypeScript check

`LanguageSwitcher.tsx` и `i18n.ts` полностью покрыты существующим job `typecheck` (`tsc --noEmit`) — без дополнительных изменений.

---

## 10. Ограничения и out-of-scope

- Перевод email-контента (письма Brevo) — отдельная фича.
- Перевод `aria-label` внутри shadcn/ui компонентов (`ui/` директория) — не переводится (компоненты используются как-есть из библиотеки).
- SEO (hreflang, meta) — не актуально для SPA без SSR.
- Серверные сообщения об ошибках (FastAPI detail) — остаются на EN.
- RTL layout — не требуется (русский LTR).

---

## 11. Порядок реализации (рекомендуемый)

1. `npm install` библиотеки → создать `i18n.ts` и оба JSON-словаря
2. `main.tsx` → `import './i18n'`
3. `LanguageSwitcher.tsx` + интеграция в `Header.tsx`
4. `App.tsx` → `document.documentElement.lang` effect
5. Перевод компонентов (порядок: Header → HomePage → AuthPage → остальные)
6. Дата-форматирование (локаль из `i18n.language`)
7. Тесты: `i18n.test.ts` + `LanguageSwitcher.test.tsx` + обновление существующих тестов
8. CI: ключ-чек в `lint` job
9. Финальный smoke: ручная проверка на `localhost:5173` двух маршрутов на двух языках

---

## Статус выполнения

**Дата мерджа:** 2026-06-28  
**PR:** #34  
**Ветка:** `russian-UI` → `main`

### Выполнено

- `54df930` — базовая инфраструктура i18n: `i18n.ts`, `i18next.d.ts`, `locales/en/`, `locales/ru/`, `LanguageSwitcher.tsx`; перевод всех страниц и компонентов (184 ключа); 357 тестов
- `81ba251` — post-merge фикс: заголовки 6 статических графиков (`t('explore.dimensions.*')`); название коллекции в кавычках «…»
- `c8eb952` — полный перевод меток в графиках: `COUNTRY_TRANSLATIONS_RU`, `DOC_TYPE_TRANSLATIONS_RU`, `OA_LABELS_RU` в `labelTranslations.ts`; `getKpiLabel` плюральные формы; `formatAxisTick` (2k → 2 тыс.); рефактор `DimensionDrawer` с `lang`-параметром; убран badge "N entries"; `MultiSelectCombobox.getDisplayLabel` для фильтров
- `ad2da95` — lint фикс: U+00A0 → пробел в `formatAxisTick`
- `41d270f` — dark mode фиксы: `DonutLabel` с тема-зависимыми цветами; YAxis `width=54` для RU; `cursor fill rgba(148,163,184,0.1)` во всех bar-чартах
- `8372715` — `translateTooltipLabel()` в `ChartTooltip` — перевод заголовка tooltip по dimension; `DrawerOAChart` dark mode

### Вне скоупа

- Перевод email-писем Brevo (отдельная фича)
- `aria-label` внутри shadcn/ui компонентов в `components/ui/`
- SEO / hreflang (SPA без SSR)
- Серверные сообщения об ошибках (FastAPI detail остаётся EN)

---

## Дальнейшая задача: сербская / черногорская латиница как 3-й язык UI

**Кандидаты:** `sr-Latn` (сербская латиница) или `cnr` (черногорский). Оба варианта технически идентичны; `sr-Latn` предпочтителен как стандартный IETF-тег с полной поддержкой CLDR.

### Что уже готово (инфраструктура из PR #34)

- `react-i18next` + `i18next-browser-languagedetector` — добавить `'sr-Latn'` в `supportedLngs` в `i18n.ts` (1 строка)
- TypeScript-типизация (`i18next.d.ts`) — не требует изменений
- Plural-система — sr-Latn использует 3 формы CLDR (`_one/_few/_other`, без `_many`); i18next поддерживает автоматически
- `MultiSelectCombobox.getDisplayLabel`, `ChartTooltip.translateTooltipLabel`, `getKpiLabel` switch — расширяются добавлением новой ветки

### Что нужно сделать

1. **Создать `locales/sr-Latn/translation.json`** — 184+ ключа. Перевести автоматически (LLM в сессии или скрипт `scripts/translate_locale.ts` через Anthropic API), затем вычитать носителем.
2. **Добавить карты меток** в `constants/labelTranslations.ts`: `COUNTRY_TRANSLATIONS_SR_LATN`, `DOC_TYPE_TRANSLATIONS_SR_LATN`, `OA_LABELS_SR_LATN`.
3. **Рефакторить `lang === 'ru'` хардкоды** (~6 мест в chart-компонентах и `ArticleFilters`) — заменить на обобщённый lookup `LABEL_MAPS[lang]?.[value] ?? value`, чтобы не плодить `|| lang === 'sr-Latn'` цепочки.
4. **`LanguageSwitcher.tsx`** — добавить третью кнопку (SR / CG).
5. **CI parity-чек** в `frontend-tests.yml` — добавить sr-Latn в скрипт; исключить `_many` из проверки (sr-Latn не использует эту форму, как уже исключены `_few`/`_many` для EN).

### Оценка трудоёмкости

~1 час технической работы + время на перевод JSON. Пункты 3 и 5 — единственный ненулевой архитектурный долг из PR #34.
