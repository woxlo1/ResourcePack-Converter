import { useMemo, useState, type ReactElement } from 'react';
import type { RuleStatus } from '@rpc/core';
import { exportReport, reportMimeType } from '@rpc/report';
import {
  Badge,
  Button,
  Card,
  DefinitionList,
  EmptyState,
  LogList,
  ScreenHeader,
  Select,
  Stat,
  StatGrid,
  Tabs,
  TextInput,
} from '../components';
import { fileKindLabelKey, formatBytes, formatDate, formatDuration, shortPath, statusTone } from '../format';
import { useAppStore, useTranslation } from '../store';
import { useAppActions } from '../actions';
import type { TranslationKey } from '../i18n';

type ResultTab = 'overview' | 'files' | 'rules' | 'validation' | 'logs' | 'report';

const TABS: { id: ResultTab; key: TranslationKey }[] = [
  { id: 'overview', key: 'result.tabs.overview' },
  { id: 'files', key: 'result.tabs.files' },
  { id: 'rules', key: 'result.tabs.rules' },
  { id: 'validation', key: 'result.tabs.validation' },
  { id: 'logs', key: 'result.tabs.logs' },
  { id: 'report', key: 'result.tabs.report' },
];

const FILE_STATUSES: RuleStatus[] = ['SUCCESS', 'WARNING', 'SKIPPED', 'FAILED', 'UNSUPPORTED'];
const MAX_ROWS = 500;

export function ResultScreen(): ReactElement {
  const t = useTranslation();
  const locale = useAppStore((state) => state.locale);
  const result = useAppStore((state) => state.result);
  const reportFormat = useAppStore((state) => state.reportFormat);
  const setReportFormat = useAppStore((state) => state.setReportFormat);
  const setScreen = useAppStore((state) => state.setScreen);
  const { downloadOutput, downloadReport, copyReport, resetSession } = useAppActions();
  const [tab, setTab] = useState<ResultTab>('overview');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<RuleStatus | 'all'>('all');

  const filteredFiles = useMemo(() => {
    if (!result) return [];
    const needle = search.trim().toLowerCase();
    return result.report.files.filter((file) => {
      if (statusFilter !== 'all' && file.status !== statusFilter) return false;
      if (!needle) return true;
      return (
        file.path.toLowerCase().includes(needle) ||
        file.rules.some((rule) => rule.toLowerCase().includes(needle)) ||
        [...file.warnings, ...file.errors].some((message) => message.toLowerCase().includes(needle))
      );
    });
  }, [result, search, statusFilter]);

  if (!result) {
    return (
      <div className="screen">
        <ScreenHeader title={t('result.heading')} />
        <EmptyState
          title={t('result.noZip')}
          action={<Button onClick={() => setScreen('configure')}>{t('preview.backToConfigure')}</Button>}
        />
      </div>
    );
  }

  const report = result.report;
  const status = report.cancelled
    ? 'cancelled'
    : report.failedCount > 0
      ? 'failed'
      : report.warningCount > 0
        ? 'warning'
        : 'success';

  const titleKey: TranslationKey =
    status === 'cancelled'
      ? 'result.cancelledTitle'
      : status === 'failed'
        ? 'result.failedTitle'
        : status === 'warning'
          ? 'result.warningTitle'
          : 'result.successTitle';
  const bodyKey: TranslationKey =
    status === 'cancelled'
      ? 'result.cancelledBody'
      : status === 'failed'
        ? 'result.failedBody'
        : status === 'warning'
          ? 'result.warningBody'
          : 'result.successBody';
  const tone = status === 'success' ? 'ok' : status === 'cancelled' ? 'muted' : status === 'failed' ? 'err' : 'warn';
  const reportText = exportReport(report, reportFormat, locale);
  const visibleFiles = filteredFiles.slice(0, MAX_ROWS);
  const outputZipSize = result.outputZip?.byteLength ?? 0;

  return (
    <div className="screen">
      <ScreenHeader
        title={t('result.heading')}
        description={t(bodyKey)}
        actions={<Badge tone={tone}>{t(titleKey)}</Badge>}
      />

      {status === 'cancelled' && (
        <div className="banner banner--info">
          <span aria-hidden="true">⏹️</span>
          <p>{t('result.cancelledHint')}</p>
        </div>
      )}

      <Card>
        <div className="result-actions">
          <Button onClick={() => void downloadOutput()} disabled={!result.outputZip}>
            {t('result.downloadZip')}
          </Button>
          <Button variant="secondary" onClick={() => void downloadReport()}>
            {t('result.downloadReport')}
          </Button>
          <Button variant="ghost" onClick={() => void copyReport()}>
            {t('result.copyReport')}
          </Button>
          <Select
            value={reportFormat}
            aria-label={t('result.reportFormat')}
            onChange={(event) => setReportFormat(event.target.value as typeof reportFormat)}
          >
            <option value="html">{t('settings.report.html')}</option>
            <option value="json">{t('settings.report.json')}</option>
            <option value="txt">{t('settings.report.txt')}</option>
            <option value="csv">{t('settings.report.csv')}</option>
          </Select>
          <span className="muted small">{reportMimeType(reportFormat)}</span>
          <span className="spacer" />
          <Button variant="ghost" onClick={() => void resetSession()}>
            {t('result.newConversion')}
          </Button>
        </div>
      </Card>

      <Tabs
        items={TABS.map((item) => ({ id: item.id, label: t(item.key) }))}
        value={tab}
        onChange={(id) => setTab(id as ResultTab)}
      />

      {tab === 'overview' && (
        <div className="stack">
          <Card title={t('result.summary')}>
            <StatGrid>
              <Stat label={t('result.totalFiles')} value={report.totalFiles} />
              <Stat label={t('result.successCount')} value={report.successCount} tone="ok" />
              <Stat label={t('result.warningCount')} value={report.warningCount} tone="warn" />
              <Stat label={t('result.failedCount')} value={report.failedCount} tone={report.failedCount > 0 ? 'err' : undefined} />
              <Stat label={t('result.skippedCount')} value={report.skippedCount} />
              <Stat label={t('result.unsupportedCount')} value={report.unsupportedCount} tone={report.unsupportedCount > 0 ? 'warn' : undefined} />
              <Stat label={t('result.validationPass')} value={report.validation.pass} tone="ok" />
              <Stat label={t('result.validationWarning')} value={report.validation.warning} tone="warn" />
              <Stat label={t('result.validationError')} value={report.validation.error} tone={report.validation.error > 0 ? 'err' : undefined} />
            </StatGrid>
          </Card>

          <div className="columns">
            <Card title={t('result.outputName')}>
              <DefinitionList
                items={[
                  { term: t('result.outputName'), description: <code>{result.outputName}</code> },
                  {
                    term: t('result.outputSize'),
                    description: result.outputZip
                      ? formatBytes(outputZipSize)
                      : t('result.noZip'),
                  },
                  { term: t('result.totalFiles'), description: result.outputFileCount },
                  { term: t('result.source'), description: report.sourceVersion },
                  { term: t('result.target'), description: report.targetVersion },
                  { term: t('result.convertedAt'), description: formatDate(report.finishedAt, locale) },
                  { term: t('result.duration'), description: formatDuration(report.durationMs) },
                ]}
              />
            </Card>
            <Card title={t('result.validationSummary')}>
              <StatGrid>
                <Stat label={t('result.validationPass')} value={report.validation.pass} tone="ok" />
                <Stat label={t('result.validationWarning')} value={report.validation.warning} tone="warn" />
                <Stat label={t('result.validationError')} value={report.validation.error} tone={report.validation.error > 0 ? 'err' : undefined} />
                <Stat label={t('result.validationNotChecked')} value={report.validation.notChecked} />
              </StatGrid>
              <p className="muted small">
                {report.unknownFiles.length > 0
                  ? `${t('analysis.unknownFiles')}: ${report.unknownFiles.length}`
                  : t('analysis.noUnknown')}
              </p>
            </Card>
          </div>
        </div>
      )}

      {tab === 'files' && (
        <Card title={t('result.tabs.files')}>
          <div className="toolbar">
            <TextInput
              value={search}
              placeholder={t('result.searchFiles')}
              aria-label={t('common.search')}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Select
              value={statusFilter}
              aria-label={t('result.filterStatus')}
              onChange={(event) => setStatusFilter(event.target.value as RuleStatus | 'all')}
            >
              <option value="all">{t('result.status.all')}</option>
              {FILE_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
            <span className="toolbar__meta">
              {t('common.showing', { shown: visibleFiles.length, total: filteredFiles.length })}
            </span>
          </div>
          {filteredFiles.length === 0 ? (
            <EmptyState title={t('result.noFiles')} />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('common.path')}</th>
                    <th>{t('common.kind')}</th>
                    <th>{t('common.status')}</th>
                    <th>{t('common.rules')}</th>
                    <th>{t('common.warnings')}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleFiles.map((file) => (
                    <tr key={file.path}>
                      <td className="mono" title={file.path}>
                        {shortPath(file.path, 56)}
                      </td>
                      <td>{t(fileKindLabelKey(file.kind))}</td>
                      <td>
                        <Badge tone={statusTone(file.status)}>{file.status}</Badge>
                      </td>
                      <td className="mono small">{file.rules.join(', ') || '—'}</td>
                      <td className="small">
                        {[...file.warnings, ...file.errors].join('; ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'rules' && (
        <Card title={t('result.tabs.rules')}>
          {report.ruleResults.length === 0 ? (
            <EmptyState title={t('result.noRules')} />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('result.ruleId')}</th>
                    <th>{t('result.ruleStatus')}</th>
                    <th>{t('common.path')}</th>
                    <th>{t('result.ruleMessage')}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.ruleResults.map((rule, index) => (
                    <tr key={`${rule.ruleId}-${index}`}>
                      <td className="mono">{rule.ruleId}</td>
                      <td>
                        <Badge tone={statusTone(rule.status)}>{rule.status}</Badge>
                      </td>
                      <td className="mono small" title={rule.file}>
                        {rule.file ? shortPath(rule.file, 44) : '—'}
                      </td>
                      <td>{rule.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'validation' && (
        <Card title={t('result.tabs.validation')}>
          {result.validation.issues.length === 0 ? (
            <EmptyState title={t('result.noIssues')} />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('result.issueStatus')}</th>
                    <th>{t('result.issueCode')}</th>
                    <th>{t('result.issuePath')}</th>
                    <th>{t('result.issueMessage')}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.validation.issues.map((issue, index) => (
                    <tr key={`${issue.code}-${index}`}>
                      <td>
                        <Badge tone={statusTone(issue.status)}>{issue.status}</Badge>
                      </td>
                      <td className="mono">{issue.code}</td>
                      <td className="mono small" title={issue.path}>
                        {issue.path ? shortPath(issue.path, 40) : '—'}
                      </td>
                      <td>{issue.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'logs' && (
        <Card title={t('result.tabs.logs')}>
          <LogList logs={result.logs} empty={t('result.noLogs')} />
        </Card>
      )}

      {tab === 'report' && (
        <Card
          title={t('result.reportPreview')}
          actions={
            <Button variant="ghost" size="sm" onClick={() => void copyReport()}>
              {t('common.copy')}
            </Button>
          }
        >
          <pre className="report-preview">{reportText}</pre>
        </Card>
      )}
    </div>
  );
}
