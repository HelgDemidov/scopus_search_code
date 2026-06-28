import { useTranslation } from 'react-i18next';

const LANGS = [
  { code: 'en',      label: 'EN' },
  { code: 'ru',      label: 'РУ' },
  { code: 'sr-Latn', label: 'CG' },
] as const;

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  return (
    <select
      value={i18n.language}
      onChange={(e) => void i18n.changeLanguage(e.target.value)}
      aria-label={t('a11y.switchLanguage')}
      className="rounded-md px-2 py-1.5 text-xs font-semibold cursor-pointer
                 bg-transparent border-0 transition-colors select-none
                 text-slate-500 dark:text-slate-400
                 hover:bg-slate-100 hover:text-slate-900
                 dark:hover:bg-slate-800 dark:hover:text-slate-100
                 focus:outline-none focus:ring-1 focus:ring-slate-300 dark:focus:ring-slate-600"
    >
      {LANGS.map(({ code, label }) => (
        <option key={code} value={code}>{label}</option>
      ))}
    </select>
  );
}
