import { useTranslation } from 'react-i18next';

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const isRu = i18n.language === 'ru';

  function toggleLanguage() {
    void i18n.changeLanguage(isRu ? 'en' : 'ru');
  }

  return (
    <button
      onClick={toggleLanguage}
      aria-label={t('a11y.switchLanguage')}
      className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-slate-500
                 hover:bg-slate-100 hover:text-slate-900
                 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100
                 transition-colors select-none"
    >
      {isRu ? 'EN' : 'РУ'}
    </button>
  );
}
