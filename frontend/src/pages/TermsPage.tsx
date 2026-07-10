import { useTranslation } from 'react-i18next';
import { useHreflangTags } from '../hooks/useHreflangTags';

// Плейсхолдер (docs/i18n-url-routing/spec.md §4.3) — резервирует URL/роут/i18n-каркас.
// Юридический текст условий использования — отдельная задача, не в скоупе этого ТЗ.
export default function TermsPage() {
  const { t } = useTranslation();
  const hreflangTags = useHreflangTags('/terms');

  return (
    <div className="mx-auto max-w-screen-sm px-4 py-16">
      {hreflangTags}
      <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
        {t('terms.title')}
      </h1>
      <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{t('terms.placeholder')}</p>
    </div>
  );
}
