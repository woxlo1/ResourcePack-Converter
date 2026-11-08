import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { ConversionProgress } from '@rpc/core';
import { Button, Card, EmptyState, LogList, ProgressBar, ScreenHeader, Stat, StatGrid } from '../components';
import { formatDuration } from '../format';
import { useAppStore, useTranslation } from '../store';
import { useAppActions } from '../actions';
import type { TranslationKey } from '../i18n';

const STAGE_KEYS: Record<ConversionProgress['stage'], TranslationKey> = {
  reading: 'progress.stage.reading',
  analyzing: 'progress.stage.analyzing',
  planning: 'progress.stage.planning',
  converting: 'progress.stage.converting',
  validating: 'progress.stage.validating',
  reporting: 'progress.stage.reporting',
  writing: 'progress.stage.writing',
  done: 'progress.stage.done',
};

export function ProgressScreen(): ReactElement {
  const t = useTranslation();
  const progress = useAppStore((state) => state.progress);
  const logs = useAppStore((state) => state.logs);
  const isRunning = useAppStore((state) => state.status.isRunning);
  const cancelling = useAppStore((state) => state.status.cancelling);
  const setScreen = useAppStore((state) => state.setScreen);
  const { cancelConversion } = useAppActions();
  const startedAt = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isRunning) return;
    const timer = window.setInterval(() => setElapsed(Date.now() - startedAt.current), 250);
    return () => window.clearInterval(timer);
  }, [isRunning]);

  if (!progress && !isRunning) {
    return (
      <div className="screen">
        <ScreenHeader title={t('progress.heading')} description={t('progress.description')} />
        <EmptyState
          title={t('preview.noPlan')}
          action={<Button onClick={() => setScreen('configure')}>{t('preview.backToConfigure')}</Button>}
        />
      </div>
    );
  }

  const value = progress?.percentage ?? 0;
  const stage = progress?.stage ?? 'converting';
  const tone = stage === 'done' ? 'ok' : cancelling ? 'warn' : 'info';

  return (
    <div className="screen">
      <ScreenHeader
        title={t('progress.heading')}
        description={t('progress.description')}
        actions={
          progress && <span className="elapsed">{t('progress.elapsed')}: {formatDuration(elapsed)}</span>
        }
      />

      <Card title={t(STAGE_KEYS[stage])}>
        <ProgressBar value={value} tone={tone} label={t(STAGE_KEYS[stage])} />
        <div className="progress-meta">
          <strong>{t('progress.percentage', { value: Math.round(value) })}</strong>
          <span className="muted">
            {t('progress.processed')}: {progress?.processedFiles ?? 0} / {progress?.totalFiles ?? 0}
          </span>
        </div>

        <StatGrid>
          <Stat label={t('result.totalFiles')} value={progress?.totalFiles ?? 0} />
          <Stat label={t('result.successCount')} value={progress?.successfulFiles ?? 0} tone="ok" />
          <Stat label={t('result.warningCount')} value={progress?.warningFiles ?? 0} tone="warn" />
          <Stat label={t('result.failedCount')} value={progress?.failedFiles ?? 0} tone="err" />
        </StatGrid>

        {progress?.currentFile && (
          <p className="current-file">
            <span className="muted">{t('progress.currentFile')}:</span> <code>{progress.currentFile}</code>
          </p>
        )}
        {progress?.message && <p className="muted small">{progress.message}</p>}

        <div className="progress-actions">
          <Button
            variant="danger"
            onClick={() => void cancelConversion()}
            disabled={!isRunning || cancelling}
          >
            {cancelling ? t('progress.cancelling') : t('progress.cancel')}
          </Button>
          <span className="muted small">{isRunning ? t('progress.keepOpen') : t('progress.finalizing')}</span>
        </div>
      </Card>

      <Card title={t('progress.logs')}>
        <LogList logs={logs} empty={t('progress.noLogs')} />
      </Card>
    </div>
  );
}
