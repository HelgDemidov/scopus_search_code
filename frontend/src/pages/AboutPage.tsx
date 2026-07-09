import { useTranslation } from 'react-i18next';

const GITHUB_REPO_URL = 'https://github.com/HelgDemidov/scopus_search_code';

const LINK_CLASSES = 'text-blue-600 dark:text-blue-400 hover:underline';

// Каркас страницы (docs/i18n-url-routing/spec.md §4.2) — структура, не копирайтинг:
// что за проект / источник данных / как это сделано (стек не скрываем, портфолио) / контакты.
// VITE_SUPPORT_EMAIL опционален (тот же паттерн graceful degradation, что utils/errorReport.ts) —
// секция "Контакты" просто не рендерится, если переменная не задана.
export default function AboutPage() {
  const { t } = useTranslation();
  const supportEmail: string | undefined = import.meta.env.VITE_SUPPORT_EMAIL;

  return (
    <div className="mx-auto max-w-screen-md px-4 py-16 flex flex-col gap-10">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
          {t('about.title')}
        </h1>
        <p className="mt-3 text-base text-slate-600 dark:text-slate-400">{t('about.intro')}</p>
      </div>

      <section>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          {t('about.dataSourceTitle')}
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          {t('about.dataSourceBody')}
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          {t('about.howBuiltTitle')}
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          {t('about.howBuiltBody')}
        </p>
        <a
          href={GITHUB_REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={`mt-2 inline-block text-sm ${LINK_CLASSES}`}
        >
          {t('about.viewSource')}
        </a>
      </section>

      {supportEmail && (
        <section>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {t('about.contactTitle')}
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            {t('about.contactBody')}{' '}
            <a href={`mailto:${supportEmail}`} className={LINK_CLASSES}>
              {supportEmail}
            </a>
          </p>
        </section>
      )}
    </div>
  );
}
