import type { ReactElement } from 'react';
import { ALL_VERSIONS } from '@rpc/version-registry';
import {
  Button,
  Card,
  Checkbox,
  DefinitionList,
  Field,
  NumberInput,
  ScreenHeader,
  SegmentedControl,
  Select,
  TextInput,
} from '../components';
import { useAppStore, useTranslation } from '../store';
import { useServices } from '../services-context';
import { useAppActions } from '../actions';
import type { Locale, Theme } from '../types';

export function SettingsScreen(): ReactElement {
  const t = useTranslation();
  const locale = useAppStore((state) => state.locale);
  const theme = useAppStore((state) => state.theme);
  const settings = useAppStore((state) => state.settings);
  const setLocale = useAppStore((state) => state.setLocale);
  const setTheme = useAppStore((state) => state.setTheme);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const resetSettings = useAppStore((state) => state.resetSettings);
  const { appVersion } = useServices();
  const { notify } = useAppActions();

  const clampNumber = (value: string, min: number, max: number, current: number): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return current;
    return Math.min(max, Math.max(min, Math.trunc(parsed)));
  };

  return (
    <div className="screen">
      <ScreenHeader
        title={t('settings.heading')}
        description={t('settings.description')}
        actions={<span className="muted small">{t('settings.saved')}</span>}
      />

      <div className="columns">
        <Card title={t('settings.appearance')}>
          <Field label={t('settings.language')} hint={t('settings.languageHint')}>
            <SegmentedControl<Locale>
              value={locale}
              ariaLabel={t('settings.language')}
              onChange={setLocale}
              options={[
                { value: 'en', label: t('settings.language.en') },
                { value: 'ja', label: t('settings.language.ja') },
              ]}
            />
          </Field>
          <Field label={t('settings.theme')}>
            <SegmentedControl<Theme>
              value={theme}
              ariaLabel={t('settings.theme')}
              onChange={setTheme}
              options={[
                { value: 'system', label: t('settings.theme.system') },
                { value: 'light', label: t('settings.theme.light') },
                { value: 'dark', label: t('settings.theme.dark') },
              ]}
            />
          </Field>
          <p className="privacy-note">
            <span aria-hidden="true">🔒</span> {t('settings.privacy')}
          </p>
        </Card>

        <Card title={t('settings.conversion')}>
          <Field label={t('settings.targetVersion')} htmlFor="settings-target">
            <Select
              id="settings-target"
              value={settings.targetVersionId}
              onChange={(event) => updateSettings({ targetVersionId: event.target.value })}
            >
              {ALL_VERSIONS.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.label} · {version.id}
                </option>
              ))}
            </Select>
          </Field>
          <div className="option-list">
            <Checkbox
              label={t('settings.validateAfterConversion')}
              checked={settings.validateAfterConversion}
              onChange={(event) => updateSettings({ validateAfterConversion: event.target.checked })}
            />
            <Checkbox
              label={t('settings.preserveUnknown')}
              checked={settings.preserveUnknownFiles}
              onChange={(event) => updateSettings({ preserveUnknownFiles: event.target.checked })}
            />
            <Checkbox
              label={t('settings.detailedLogs')}
              checked={settings.detailedLogs}
              onChange={(event) => updateSettings({ detailedLogs: event.target.checked })}
            />
          </div>
          <Field label={t('settings.reportFormat')} htmlFor="settings-report">
            <Select
              id="settings-report"
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
          <Field
            label={t('settings.outputFileName')}
            hint={t('settings.outputFileNameHint')}
            htmlFor="settings-output"
          >
            <TextInput
              id="settings-output"
              value={settings.outputFileName}
              onChange={(event) => updateSettings({ outputFileName: event.target.value })}
            />
          </Field>
        </Card>
      </div>

      <Card title={t('settings.limits')}>
        <div className="form-grid">
          <Field label={t('settings.maxFileCount')} hint={t('settings.maxFileCountHint')} htmlFor="settings-max-files">
            <NumberInput
              id="settings-max-files"
              min={1}
              max={200_000}
              value={settings.maxFileCount}
              onChange={(event) => updateSettings({ maxFileCount: Number(event.target.value) || 1 })}
              onBlur={(event) =>
                updateSettings({
                  maxFileCount: clampNumber(event.target.value, 1, 200_000, settings.maxFileCount),
                })
              }
            />
          </Field>
          <Field label={t('settings.maxTotalMb')} hint={t('settings.maxTotalMbHint')} htmlFor="settings-max-total">
            <NumberInput
              id="settings-max-total"
              min={1}
              max={4096}
              value={settings.maxTotalMb}
              onChange={(event) => updateSettings({ maxTotalMb: Number(event.target.value) || 1 })}
              onBlur={(event) =>
                updateSettings({
                  maxTotalMb: clampNumber(event.target.value, 1, 4096, settings.maxTotalMb),
                })
              }
            />
          </Field>
        </div>
      </Card>

      <div className="columns">
        <Card title={t('settings.reset')} description={t('settings.resetHint')}>
          <Button
            variant="danger"
            onClick={() => {
              resetSettings();
              notify(t('settings.resetDone'));
            }}
          >
            {t('settings.reset')}
          </Button>
        </Card>

        <Card title={t('settings.about')}>
          <DefinitionList
            items={[
              { term: t('settings.version'), description: appVersion },
              { term: t('settings.license'), description: t('settings.licenseValue') },
              { term: t('app.badge'), description: t('settings.offline') },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}
