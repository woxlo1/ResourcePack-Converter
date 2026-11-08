import type { ReactElement } from 'react';
import { formatPackFormat } from '@rpc/core';
import { ALL_VERSIONS, LATEST_VERSION } from '@rpc/version-registry';
import { Badge, Button, Card, ScreenHeader } from '../components';
import { useAppStore, useTranslation } from '../store';
import { useAppActions } from '../actions';

const STEPS = [
  { title: 'home.step1.title', body: 'home.step1.body' },
  { title: 'home.step2.title', body: 'home.step2.body' },
  { title: 'home.step3.title', body: 'home.step3.body' },
  { title: 'home.step4.title', body: 'home.step4.body' },
] as const;

const FEATURES = [
  { title: 'home.feature.rules.title', body: 'home.feature.rules.body' },
  { title: 'home.feature.preview.title', body: 'home.feature.preview.body' },
  { title: 'home.feature.report.title', body: 'home.feature.report.body' },
  { title: 'home.feature.privacy.title', body: 'home.feature.privacy.body' },
] as const;

export function HomeScreen(): ReactElement {
  const t = useTranslation();
  const setScreen = useAppStore((state) => state.setScreen);
  const source = useAppStore((state) => state.source);
  const historyCount = useAppStore((state) => state.history.length);
  const { resetSession } = useAppActions();

  const begin = (): void => {
    if (source) setScreen('configure');
    else setScreen('import');
  };

  return (
    <div className="screen home">
      <ScreenHeader
        title={t('app.title')}
        description={t('app.tagline')}
        actions={<Badge tone="info">{t('app.badge')}</Badge>}
      />

      <section className="hero">
        <div className="hero__body">
          <h2>{t('home.heading')}</h2>
          <p>{t('home.subheading')}</p>
          <div className="hero__actions">
            <Button size="md" onClick={begin}>
              {source ? t('configure.heading') : t('home.start')}
            </Button>
            <Button variant="secondary" onClick={() => setScreen('import')}>
              {t('home.importNow')}
            </Button>
            <Button variant="ghost" onClick={() => setScreen('history')}>
              {t('home.viewHistory')}
              {historyCount > 0 ? ` (${historyCount})` : ''}
            </Button>
            {source && (
              <Button variant="ghost" onClick={() => void resetSession()}>
                {t('common.reset')}
              </Button>
            )}
          </div>
        </div>
        <aside className="hero__aside">
          <div className="hero__metric">
            <span>{t('home.latestTarget')}</span>
            <strong>{LATEST_VERSION.label}</strong>
            <small>
              {t('common.format')} {formatPackFormat(LATEST_VERSION.resourcePackFormat)}
            </small>
          </div>
          <div className="hero__metric">
            <span>{t('home.supported.title')}</span>
            <strong>{ALL_VERSIONS.length}</strong>
            <small>{t('home.formats', { count: ALL_VERSIONS.length })}</small>
          </div>
        </aside>
      </section>

      <div className="columns">
        <Card title={t('home.workflow.title')}>
          <ol className="steps">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <span className="steps__index">{index + 1}</span>
                <div>
                  <strong>{t(step.title)}</strong>
                  <p>{t(step.body)}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
        <Card title={t('home.privacy.title')} description={t('home.privacy.body')}>
          <div className="privacy-visual">
            <span className="privacy-visual__icon" aria-hidden="true">
              🔒
            </span>
            <p>{t('import.privacy')}</p>
          </div>
        </Card>
      </div>

      <Card title={t('home.features.title')}>
        <div className="feature-grid">
          {FEATURES.map((feature) => (
            <article key={feature.title} className="feature">
              <h3>{t(feature.title)}</h3>
              <p>{t(feature.body)}</p>
            </article>
          ))}
        </div>
      </Card>

      <div className="banner banner--info">
        <span aria-hidden="true">ℹ️</span>
        <p>{t('home.notice')}</p>
      </div>
    </div>
  );
}
