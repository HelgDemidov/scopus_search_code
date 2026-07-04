import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { ErrorPanel } from '../../components/error/ErrorPanel';
import { useBlackHole } from '../../hooks/useBlackHole';
import { buildReportMailto } from '../../utils/errorReport';

const BLACK_HOLE_POSITION = { xRatio: 0.86, yRatio: 0.82 };

// Короткий client-side корреляционный код — НЕ X-Request-ID с бэкенда
// (для этого нет соответствующего HTTP-запроса: ошибка — это упавший
// рендер/чанк, а не ответ API). Даёт то же «что скопировать в отчёт»,
// визуально согласован с toast'ом 5xx (см. api/client.ts).
function generateIncidentId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(16).slice(2, 10);
}

export default function RouteErrorPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const error = useRouteError();
  const incidentId = useMemo(() => generateIncidentId(), []);

  useBlackHole(BLACK_HOLE_POSITION);

  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : String(error);

  const reportHref = buildReportMailto({ requestId: incidentId, message });

  return (
    <ErrorPanel
      statusLabel={t('errors.routeError.status')}
      monoLabel={t('errors.routeError.idLabel')}
      monoValue={incidentId}
      copyable
      title={t('errors.routeError.title')}
      description={t('errors.routeError.description')}
    >
      <Button onClick={() => window.location.reload()}>{t('errors.routeError.retry')}</Button>
      <Button variant="outline" onClick={() => navigate('/')}>
        {t('errors.routeError.home')}
      </Button>
      {reportHref && (
        <Button variant="ghost" asChild>
          <a href={reportHref}>{t('errors.routeError.report')}</a>
        </Button>
      )}
    </ErrorPanel>
  );
}
