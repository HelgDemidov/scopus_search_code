import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { ErrorPanel } from '../../components/error/ErrorPanel';
import { useBlackHole } from '../../hooks/useBlackHole';
import { useBlackHoleMessageAnchor } from '../../hooks/useBlackHoleMessageAnchor';
import { BLACK_HOLE_POSITION } from '../../constants/blackHole';

export default function NotFoundPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
      <Button variant="outline" onClick={() => navigate('/')}>{t('errors.notFound.home')}</Button>
      {/* Цвет — 1:1 классы кнопки "Sign in" в Header.tsx (тот же сквозной
          бренд-акцент, что у лого/статус-лейбла/угловых рисок панели) */}
      <Button
        asChild
        className="bg-blue-800 hover:bg-blue-900 dark:bg-blue-500 dark:hover:bg-blue-400 text-white"
      >
        <Link to="/explore">{t('errors.notFound.exploreCollection')}</Link>
      </Button>
    </ErrorPanel>
  );
}
