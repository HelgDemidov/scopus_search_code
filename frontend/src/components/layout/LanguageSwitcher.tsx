import { useTranslation } from 'react-i18next';

const LANGS = [
  { code: 'en',      label: 'EN' },
  { code: 'ru',      label: 'РУ' },
  { code: 'sr-Latn', label: 'CG' },
] as const;

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const current = i18n.language;

  return (
    <div role="group" aria-label={t('a11y.switchLanguage')} className="flex items-center gap-0.5">
      {LANGS.map(({ code, label }) => (
        <button
          key={code}
          onClick={() => void i18n.changeLanguage(code)}
          aria-pressed={current === code}
          className={`rounded-md px-2 py-1.5 text-xs font-semibold transition-colors select-none
            ${current === code
              ? 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-100'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
            }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
