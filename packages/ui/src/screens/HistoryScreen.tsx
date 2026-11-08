import type { ReactElement } from 'react';
import type { HistoryEntryView } from '../types';
import { Badge, Button, Card, EmptyState, ScreenHeader, Stat, StatGrid } from '../components';
import { formatDate, formatDuration } from '../format';
import { useAppStore, useTranslation } from '../store';
import { useAppActions } from '../actions';
import type { Tone } from '../components';
import type { TranslationKey } from '../i18n';

const STATUS_TONE: Record<HistoryEntryView['status'], Tone> = {
  success: 'ok',
  warning: 'warn',
  failed: 'err',
  cancelled: 'muted',
};

const STATUS_KEY: Record<HistoryEntryView['status'], TranslationKey> = {
  success: 'history.status.success',
  warning: 'history.status.warning',
  failed: 'history.status.failed',
  cancelled: 'history.status.cancelled',
};

export function HistoryScreen(): ReactElement {
  const t = useTranslation();
  const locale = useAppStore((state) => state.locale);
  const history = useAppStore((state) => state.history);
  const source = useAppStore((state) => state.source);
  const clearHistory = useAppStore((state) => state.clearHistory);
  const removeHistory = useAppStore((state) => state.removeHistory);
  const { openSourceAnalysis } = useAppActions();

  const warnings = history.reduce((sum, entry) => sum + entry.warnings, 0);
  const errors = history.reduce((sum, entry) => sum + entry.errors, 0);

  return (
    <div className="screen">
      <ScreenHeader
        title={t('history.heading')}
        description={t('history.description')}
        actions={
          history.length > 0 ? (
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (window.confirm(t('history.confirmClear'))) clearHistory();
              }}
            >
              {t('history.clear')}
            </Button>
          ) : undefined
        }
      />

      {history.length === 0 ? (
        <EmptyState title={t('history.empty')} body={t('history.emptyHint')} />
      ) : (
        <>
          <Card title={t('history.count', { count: history.length })}>
            <StatGrid>
              <Stat label={t('history.count', { count: history.length })} value={history.length} />
              <Stat label={t('history.warnings')} value={warnings} tone={warnings > 0 ? 'warn' : undefined} />
              <Stat label={t('history.errors')} value={errors} tone={errors > 0 ? 'err' : undefined} />
            </StatGrid>
          </Card>

          <Card>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('history.packName')}</th>
                    <th>{t('history.source')}</th>
                    <th>{t('history.target')}</th>
                    <th>{t('history.date')}</th>
                    <th>{t('history.duration')}</th>
                    <th>{t('history.status')}</th>
                    <th>{t('history.warnings')}</th>
                    <th>{t('history.errors')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {history.map((entry) => {
                    const canOpen = source?.name === entry.packName;
                    return (
                      <tr key={entry.id}>
                        <td title={entry.packName}>{entry.packName}</td>
                        <td>{entry.sourceVersion}</td>
                        <td>{entry.targetVersion}</td>
                        <td>{formatDate(entry.executedAt, locale)}</td>
                        <td>{formatDuration(entry.durationMs)}</td>
                        <td>
                          <Badge tone={STATUS_TONE[entry.status]}>{t(STATUS_KEY[entry.status])}</Badge>
                        </td>
                        <td>{entry.warnings}</td>
                        <td>{entry.errors}</td>
                        <td>
                          <div className="row-actions">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={!canOpen}
                              title={canOpen ? t('history.openResult') : t('history.unavailable')}
                              onClick={() => openSourceAnalysis()}
                            >
                              {t('history.openResult')}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeHistory(entry.id)}
                              aria-label={t('history.delete')}
                            >
                              ✕
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
