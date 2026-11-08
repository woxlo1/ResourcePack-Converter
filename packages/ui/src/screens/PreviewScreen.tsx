import { useMemo, useState, type ReactElement } from 'react';
import { formatPackFormat, type PlanAction } from '@rpc/core';
import { getRuleMetadata } from '@rpc/version-registry';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ScreenHeader,
  Select,
  Stat,
  StatGrid,
  TextInput,
} from '../components';
import { actionLabelKey, actionTone, fileKindLabelKey, shortPath } from '../format';
import { useAppStore, useTranslation } from '../store';
import { useAppActions } from '../actions';

const ACTIONS: PlanAction[] = ['convert', 'validate', 'preserve', 'regenerate', 'unsupported', 'drop'];
const MAX_ROWS = 500;

export function PreviewScreen(): ReactElement {
  const t = useTranslation();
  const source = useAppStore((state) => state.source);
  const setScreen = useAppStore((state) => state.setScreen);
  const { startConversion } = useAppActions();
  const [search, setSearch] = useState('');
  const [action, setAction] = useState<PlanAction | 'all'>('all');

  const plan = source?.plan ?? null;
  const items = useMemo(() => {
    if (!plan) return [];
    const needle = search.trim().toLowerCase();
    return plan.items.filter((item) => {
      if (action !== 'all' && item.action !== action) return false;
      if (!needle) return true;
      return (
        item.path.toLowerCase().includes(needle) ||
        item.reason.toLowerCase().includes(needle) ||
        item.ruleIds.some((ruleId) => ruleId.toLowerCase().includes(needle))
      );
    });
  }, [action, plan, search]);

  if (!source || !plan) {
    return (
      <div className="screen">
        <ScreenHeader title={t('preview.heading')} description={t('preview.description')} />
        <EmptyState
          title={t('preview.noPlan')}
          action={<Button onClick={() => setScreen('configure')}>{t('preview.backToConfigure')}</Button>}
        />
      </div>
    );
  }

  const visible = items.slice(0, MAX_ROWS);

  return (
    <div className="screen">
      <ScreenHeader
        title={t('preview.heading')}
        description={t('preview.description')}
        actions={
          <Button onClick={() => void startConversion()}>{t('preview.start')}</Button>
        }
      />

      <Card title={t('preview.planSummary')}>
        <StatGrid>
          <Stat label={t('common.files')} value={plan.totalFiles} />
          <Stat label={t('configure.filesToConvert')} value={plan.filesToConvert} tone="info" />
          <Stat label={t('configure.filesToValidate')} value={plan.filesToValidate} tone="ok" />
          <Stat label={t('configure.filesPreserved')} value={plan.filesPreserved} />
          <Stat
            label={t('configure.filesUnsupported')}
            value={plan.filesUnsupported}
            tone={plan.filesUnsupported > 0 ? 'warn' : undefined}
          />
        </StatGrid>
      </Card>

      <Card title={t('preview.itemsTitle')}>
        <div className="toolbar">
          <TextInput
            value={search}
            placeholder={t('preview.searchPlaceholder')}
            aria-label={t('common.search')}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select
            value={action}
            aria-label={t('preview.filterAction')}
            onChange={(event) => setAction(event.target.value as PlanAction | 'all')}
          >
            <option value="all">{t('preview.actions.all')}</option>
            {ACTIONS.map((value) => (
              <option key={value} value={value}>
                {t(actionLabelKey(value))}
              </option>
            ))}
          </Select>
          <span className="toolbar__meta">
            {t('common.showing', { shown: visible.length, total: items.length })}
          </span>
        </div>

        {items.length === 0 ? (
          <EmptyState title={t('preview.empty')} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('common.path')}</th>
                  <th>{t('common.kind')}</th>
                  <th>{t('common.action')}</th>
                  <th>{t('common.rules')}</th>
                  <th>{t('common.reason')}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.path}>
                    <td className="mono" title={item.path}>
                      {shortPath(item.path, 56)}
                    </td>
                    <td>{t(fileKindLabelKey(item.kind))}</td>
                    <td>
                      <Badge tone={actionTone(item.action)}>{t(actionLabelKey(item.action))}</Badge>
                    </td>
                    <td className="mono small">{item.ruleIds.join(', ') || '—'}</td>
                    <td>{item.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {items.length > visible.length && (
          <p className="muted small">
            {t('common.showing', { shown: visible.length, total: items.length })}
          </p>
        )}
        <p className="muted small">
          {t('preview.preservedHint')} {t('preview.unsupportedHint')}
        </p>
      </Card>

      <div className="columns">
        <Card title={t('preview.rulesTitle')}>
          <ul className="rule-list">
            {plan.rules.map((rule) => {
              const metadata = getRuleMetadata(rule.id);
              return (
                <li key={rule.id}>
                  <div className="rule-list__header">
                    <strong>{rule.name}</strong>
                    <code>{rule.id}</code>
                  </div>
                  <p>{rule.description}</p>
                  {metadata && (
                    <p className="muted small">
                      {t('preview.ruleIntroduced', {
                        format: formatPackFormat(metadata.introducedIn),
                      })}
                    </p>
                  )}
                </li>
              );
            })}
            {plan.rules.length === 0 && <li className="muted">{t('common.none')}</li>}
          </ul>
        </Card>
        <Card title={t('preview.warningsTitle')}>
          {plan.expectedWarnings.length > 0 ? (
            <ul className="bullet-list bullet-list--warn">
              {plan.expectedWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t('preview.noWarnings')}</p>
          )}
        </Card>
      </div>

      <div className="screen-actions">
        <Button variant="secondary" onClick={() => setScreen('configure')}>
          {t('preview.backToConfigure')}
        </Button>
        <Button onClick={() => void startConversion()}>{t('preview.start')}</Button>
      </div>
    </div>
  );
}
