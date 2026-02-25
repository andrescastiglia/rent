import { Screen } from '@/components/screen';
import { Body, H1 } from '@/components/ui';
import { useTranslation } from 'react-i18next';

export default function ReportsScreen() {
  const { t } = useTranslation();

  return (
    <Screen>
      <H1>{t('reports.title')}</H1>
      <Body>{t('reports.subtitle')}</Body>
    </Screen>
  );
}
