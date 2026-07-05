import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { ErrorPanel } from '../../components/error/ErrorPanel';
import { useBlackHole } from '../../hooks/useBlackHole';
import { BLACK_HOLE_POSITION } from '../../constants/blackHole';

export default function NotFoundPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  useBlackHole(BLACK_HOLE_POSITION);

  return (
    <ErrorPanel
      statusLabel={t('errors.notFound.status')}
      monoLabel={t('errors.notFound.queryLabel')}
      monoValue={location.pathname}
      title={t('errors.notFound.title')}
      description={t('errors.notFound.description')}
    >
      <Button onClick={() => navigate('/')}>{t('errors.notFound.home')}</Button>
    </ErrorPanel>
  );
}
