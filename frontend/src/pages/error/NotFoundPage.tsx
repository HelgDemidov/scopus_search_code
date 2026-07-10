import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { ErrorPanel } from '../../components/error/ErrorPanel';
import { LocalizedLink } from '../../components/layout/LocalizedLink';
import { useLocalizedNavigate } from '../../hooks/useLocalizedNavigate';
import { useDefaultLandingPath } from '../../hooks/useDefaultLandingPath';
import { useBlackHole } from '../../hooks/useBlackHole';
import { useBlackHoleMessageAnchor } from '../../hooks/useBlackHoleMessageAnchor';
import { BLACK_HOLE_POSITION } from '../../constants/blackHole';

export default function NotFoundPage() {
  const { t } = useTranslation();
  const navigate = useLocalizedNavigate();
  // Учитывает и рендер как настоящего /:lang/* catch-all, и рендер напрямую из
  // LocaleLayout при невалидном :lang (useLocalizedPath внутри резолвит на
  // i18n.language в обоих случаях — §5 ТЗ)
  const landingPath = useDefaultLandingPath();
  const location = useLocation();
  const panelRef = useRef<HTMLDivElement>(null);

  useBlackHole(BLACK_HOLE_POSITION);
  useBlackHoleMessageAnchor(panelRef);

  return (
    <ErrorPanel
      ref={panelRef}
      statusLabel={t('errors.notFound.status')}
      monoLabel={t('errors.notFound.queryLabel')}
      monoValue={location.pathname}
      title={t('errors.notFound.title')}
      description={t('errors.notFound.description')}
      // Равноправная outline/solid пара (п.9.4/9.5, docs/error-experience/
      // spec.md) — прижаты к краям ОТРИСОВАННОГО текста description (ширина
      // измеряется в ErrorPanel через Range, не max-w-sm блока — тот шире
      // центрированного внутри него текста), а не по центру.
      actionsClassName="mx-auto justify-between"
    >
      {/* flex-1 basis-0 на ВСЕХ размерах (не только ниже sm) — пост-пост-фикс
          2026-07-09, docs/layout-overhaul/spec.md §10: раньше на ≥sm кнопка
          возвращалась к auto-ширине (только по своему тексту, короче Explore
          collection), из-за чего между кнопками внутри maxWidth-контейнера
          оставался неоправданно широкий зазор. Теперь Go home всегда равна по
          ширине Explore collection — надпись центрируется в более широкой
          кнопке (Button уже justify-center по умолчанию), это и есть
          стандартный паттерн для равноширокой пары CTA. */}
      <Button
        variant="outline"
        onClick={() => navigate(landingPath)}
        className="flex-1 basis-0"
      >
        {t('errors.notFound.home')}
      </Button>
      {/* Цвет — 1:1 классы кнопки "Sign in" в Header.tsx (тот же сквозной
          бренд-акцент, что у лого/статус-лейбла/угловых рисок панели).
          flex-1 basis-0 на всех размерах — пара кнопок делит ширину ряда
          поровну и всегда влезает в одну строку (§10.4 post-prod, docs/
          layout-overhaul/spec.md); короткий лейбл ниже sm — по той же причине
          полный "Explore collection" физически не влезал рядом с "Go home". */}
      <Button
        asChild
        className="flex-1 basis-0 bg-blue-800 hover:bg-blue-900 dark:bg-blue-500 dark:hover:bg-blue-400 text-white"
      >
        <LocalizedLink to="/explore">
          <span className="sm:hidden">{t('errors.notFound.exploreShort')}</span>
          <span className="hidden sm:inline">{t('errors.notFound.exploreCollection')}</span>
        </LocalizedLink>
      </Button>
    </ErrorPanel>
  );
}
