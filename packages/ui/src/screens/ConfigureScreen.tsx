import { useEffect, useState, type ReactElement } from 'react';
import { formatPackFormat } from '@rpc/core';
import { ALL_VERSIONS, getVersionById } from '@rpc/version-registry';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  DefinitionList,
  EmptyState,
  Field,
  NumberInput,
  ScreenHeader,
  Select,
  Stat,
  StatGrid,
  TextInput,
} from '../components';
import { formatBytes } from '../format';
import { useAppStore, useTranslation } from '../store';
import { useAppActions } from '../actions';

export function ConfigureScreen(): ReactElement {
  const t = useTranslation();
  const source = useAppStore((state) => state.source);
  const settings = useAppStore((state) => state.settings);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const setScreen = useAppStore((state) => state.setScreen);
  const { refreshPlan, startConversion } = useAppActions();
  const [planning, setPlanning] = useState(false);

  const sourceId = source?.sourceId ?? null;
  const { targetVersionId, preserveUnknownFiles } = settings;

  useEffect(() => {
    if (!sourceId) return;
    let active = true;
    setPlanning(true);
    void refreshPlan().finally(() => {
      if (active) setPlanning(false);
    });
    return () => {
      active = false;
    };
  }, [sourceId, targetVersionId, preserveUnknownFiles, refreshPlan]);

  if (!source) {
    return (
      <div className="screen">
        <ScreenHeader title={t('configure.heading')} description={t('configure.description')} />
        <EmptyState
          title={t('import.noFile')}
          body={t('import.description')}
          action={<Button onClick={() => setScreen('import')}>{t('home.importNow')}</Button>}
        />
      </div>
    );
  }

  const plan = source.plan;
  const target = getVersionById(settings.targetVersionId) ?? ALL_VERSIONS[ALL_VERSIONS.length - 1];
  const sourceFormat = source.analysis.detection.format;
  const targetFormat = target?.resourcePackFormat;

  return (
    <div className="screen">
      <ScreenHeader
        title={t('configure.heading')}
        description={t('configure.description')}
        actions={
          <Button variant="secondary" onClick={() => setScreen('preview')} disabled={!plan}>
            {t('nav.preview')}
          </Button>
        }
      />

      <div className="columns">
        <Card title={t('configure.target')}>
          <Field label={t('version.selectLabel')} htmlFor="target-version">
            <Select
              id="target-version"
              value={settings.targetVersionId}
              onChange={(event) => updateSettings({ targetVersionId: event.target.value })}
            >
              {ALL_VERSIONS.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.label} · {version.id} · format {formatPackFormat(version.resourcePackFormat)}
                </option>
              ))}
            </Select>
          </Field>
          <DefinitionList
            items={[
              {
                term: t('configure.sourceFormat', {
                  format: sourceFormat ? formatPackFormat(sourceFormat) : '?',
                }),
                description: sourceFormat
                  ? source.analysis.detection.matchedVersions.map((version) => version.label).join(', ') ||
                    t('common.unknown')
                  : t('common.unknown'),
              },
              {
                term: t('configure.targetFormat', {
                  format: targetFormat ? formatPackFormat(targetFormat) : '?',
                }),
                description: target ? <Badge tone="info">{target.label}</Badge> : t('common.unknown'),
              },
            ]}
          />
          {target?.notes && target.notes.length > 0 && (
            <>
              <h3 className="subheading">{t('common.notes')}</h3>
              <ul className="bullet-list">
                {target.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card title={t('configure.options')}>
          <div className="option-list">
            <Checkbox
              label={t('configure.validate')}
              hint={t('configure.validateHint')}
              checked={settings.validateAfterConversion}
              onChange={(event) => updateSettings({ validateAfterConversion: event.target.checked })}
            />
            <Checkbox
              label={t('configure.preserveUnknown')}
              hint={t('configure.preserveUnknownHint')}
              checked={settings.preserveUnknownFiles}
              onChange={(event) => updateSettings({ preserveUnknownFiles: event.target.checked })}
            />
            <Checkbox
              label={t('configure.detailedLogs')}
              hint={t('configure.detailedLogsHint')}
              checked={settings.detailedLogs}
              onChange={(event) => updateSettings({ detailedLogs: event.target.checked })}
            />
          </div>
          <Field label={t('configure.outputName')} hint={t('configure.outputNameHint')} htmlFor="output-name">
            <TextInput
              id="output-name"
              value={settings.outputFileName}
              placeholder={t('common.optional')}
              onChange={(event) => updateSettings({ outputFileName: event.target.value })}
            />
          </Field>
          <Field label={t('configure.reportFormat')} htmlFor="report-format">
            <Select
              id="report-format"
              value={settings.reportFormat}
              onChange={(event) =>
                updateSettings({ reportFormat: event.target.value as typeof settings.reportFormat })
              }
            >
              <option value="html">{t('settings.report.html')}</option>
              <option value="json">{t('settings.report.json')}</option>
              <option value="txt">{t('settings.report.txt')}</option>
              <option value="csv">{t('settings.report.csv')}</option>
            </Select>
          </Field>
        </Card>
      </div>

      <Card title={t('configure.limits')} description={t('configure.limitsHint')}>
        <div className="form-grid">
          <Field label={t('configure.maxFiles')} htmlFor="limit-files">
            <NumberInput
              id="limit-files"
              min={1}
              max={200_000}
              value={settings.maxFileCount}
              onChange={(event) => updateSettings({ maxFileCount: Number(event.target.value) || 1 })}
            />
          </Field>
          <Field label={t('configure.maxTotalMb')} htmlFor="limit-total">
            <NumberInput
              id="limit-total"
              min={1}
              max={4096}
              value={settings.maxTotalMb}
              onChange={(event) => updateSettings({ maxTotalMb: Number(event.target.value) || 1 })}
            />
          </Field>
        </div>
      </Card>

      <Card
        title={t('configure.plan')}
        description={planning ? t('common.loading') : t('configure.planPending')}
        actions={
          <Button variant="ghost" size="sm" onClick={() => void refreshPlan()} disabled={planning}>
            {t('configure.refreshPlan')}
          </Button>
        }
      >
        {plan ? (
          <>
            <StatGrid>
              <Stat label={t('configure.filesToConvert')} value={plan.filesToConvert} tone="info" />
              <Stat label={t('configure.filesToValidate')} value={plan.filesToValidate} tone="ok" />
              <Stat label={t('configure.filesPreserved')} value={plan.filesPreserved} />
              <Stat
                label={t('configure.filesUnsupported')}
                value={plan.filesUnsupported}
                tone={plan.filesUnsupported > 0 ? 'warn' : undefined}
              />
              <Stat label={t('common.files')} value={plan.totalFiles} />
              <Stat label={t('configure.rulesApplied')} value={plan.rules.length} />
            </StatGrid>

            <div className="columns">
              <div>
                <h3 className="subheading">{t('common.rules')}</h3>
                <ul className="rule-list">
                  {plan.rules.map((rule) => (
                    <li key={rule.id}>
                      <div className="rule-list__header">
                        <strong>{rule.name}</strong>
                        <code>{rule.id}</code>
                      </div>
                      <p>{rule.description}</p>
                    </li>
                  ))}
                  {plan.rules.length === 0 && <li className="muted">{t('common.none')}</li>}
                </ul>
              </div>
              <div>
                <h3 className="subheading">{t('configure.expectedWarnings')}</h3>
                {plan.expectedWarnings.length > 0 ? (
                  <ul className="bullet-list bullet-list--warn">
                    {plan.expectedWarnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">{t('configure.noWarnings')}</p>
                )}
                <p className="muted small">
                  {t('configure.totalItems', { count: plan.items.length })} ·{' '}
                  {formatBytes(source.analysis.totalUncompressedSize)}
                </p>
              </div>
            </div>
          </>
        ) : (
          <p className="muted">{planning ? t('common.loading') : t('configure.planError')}</p>
        )}
      </Card>

      <div className="screen-actions">
        <Button variant="secondary" onClick={() => setScreen('analysis')}>
          {t('common.back')}
        </Button>
        <Button onClick={() => void startConversion()} disabled={!plan || planning}>
          {t('configure.start')}
        </Button>
      </div>
    </div>
  );
}
