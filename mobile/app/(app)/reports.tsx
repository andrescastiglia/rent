import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { reportsApi, type BatchReportRun } from '@/api/reports';
import { ModuleListScreen } from '@/components/module-list';

const formatDate = (value: string | null): string => {
  if (!value) return '-';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleString();
};

export default function ReportsScreen() {
  const { t } = useTranslation();

  return (
    <ModuleListScreen<BatchReportRun>
      title={t('reports.title')}
      subtitle={t('reports.subtitle')}
      queryKey={['reports', 'recent']}
      queryFn={reportsApi.getRecent}
      renderItem={(report) => {
        const reportTypeLabel = t(`reports.types.${report.reportType}`);
        const statusLabel = t(`reports.status.${report.status}`);

        return (
          <View
            style={styles.card}
            accessible
            accessibilityLabel={`${reportTypeLabel}, ${statusLabel}`}
          >
            <View style={styles.row}>
              <Text style={styles.title} accessibilityRole="header">
                {reportTypeLabel}
              </Text>
              <Text style={styles.status}>{statusLabel}</Text>
            </View>
            <Text style={styles.detail}>{report.ownerName || '-'}</Text>
            <Text style={styles.detail}>{report.period ?? '-'}</Text>
            <Text style={styles.detail}>
              {`${report.recordsProcessed}/${report.recordsTotal}`}
              {report.recordsFailed
                ? ` · ${t('reports.failedCount', { count: report.recordsFailed })}`
                : ''}
            </Text>
            <Text style={styles.detail}>{formatDate(report.createdAt)}</Text>
            {report.dryRun ? (
              <Text style={styles.warning}>{t('reports.dryRun')}</Text>
            ) : null}
            {report.errorMessage ? (
              <Text style={styles.error}>{report.errorMessage}</Text>
            ) : null}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 5,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: { flex: 1, color: '#0f172a', fontWeight: '700' },
  status: { color: '#1d4ed8', fontWeight: '600' },
  detail: { color: '#475569' },
  warning: { color: '#92400e', fontWeight: '600' },
  error: { color: '#b91c1c' },
});
