import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';
import { Button } from '../components/ui/button';

// Маркетинговый лендинг (docs/i18n-url-routing/spec.md §4.1) — разведён из
// прежнего HomePage.tsx, где эта роль (герой + CTA) была слита с самим поиском
// (теперь SearchPage.tsx). Копирайтинг/визуальный дизайн — вне скоупа этого
// ТЗ, здесь только структура: заголовок/подзаголовок + CTA на /search и /auth.
export default function MainPage() {
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <div className="mx-auto max-w-screen-sm px-4 py-16 flex flex-col items-center gap-6 text-center">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
          {t('main.heroTitle')}
        </h1>
        <p className="mt-3 text-base text-slate-500 dark:text-slate-400">
          {t('main.heroSubtitle')}
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          asChild
          size="lg"
          className="bg-blue-800 hover:bg-blue-900 dark:bg-blue-500 dark:hover:bg-blue-400 text-white rounded-md"
        >
          <Link to="/search">{t('main.ctaSearch')}</Link>
        </Button>
        {/* Sign in CTA — только для анонимных; авторизованному пользователю нечего подписывать */}
        {!isAuthenticated && (
          <Button asChild variant="outline" size="lg">
            <Link to="/auth">{t('main.ctaSignIn')}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
