import { useEffect, type ReactElement } from 'react';
import { ErrorBanner, NoticeBanner } from './components';
import { useAppStore, useTranslation } from './store';
import type { Screen } from './types';
import type { TranslationKey } from './i18n';
import { HomeScreen } from './screens/HomeScreen';
import { ImportScreen } from './screens/ImportScreen';
import { AnalysisScreen } from './screens/AnalysisScreen';
import { ConfigureScreen } from './screens/ConfigureScreen';
import { PreviewScreen } from './screens/PreviewScreen';
import { ProgressScreen } from './screens/ProgressScreen';
import { ResultScreen } from './screens/ResultScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { SettingsScreen } from './screens/SettingsScreen';

const NAV: { screen: Screen; key: TranslationKey; icon: string }[] = [
  { screen: 'home', key: 'nav.home', icon: '🏠' },
  { screen: 'import', key: 'nav.import', icon: '📥' },
  { screen: 'analysis', key: 'nav.analysis', icon: '🔍' },
  { screen: 'configure', key: 'nav.configure', icon: '⚙️' },
  { screen: 'preview', key: 'nav.preview', icon: '👁️' },
  { screen: 'progress', key: 'nav.progress', icon: '⏳' },
  { screen: 'result', key: 'nav.result', icon: '✅' },
  { screen: 'history', key: 'nav.history', icon: '🗂️' },
  { screen: 'settings', key: 'nav.settings', icon: '🎛️' },
];

const THEME_ICON = { system: '🌓', light: '☀️', dark: '🌙' } as const;

function ScreenView({ screen }: { screen: Screen }): ReactElement {
  switch (screen) {
    case 'import':
      return <ImportScreen />;
    case 'analysis':
      return <AnalysisScreen />;
    case 'configure':
      return <ConfigureScreen />;
    case 'preview':
      return <PreviewScreen />;
    case 'progress':
      return <ProgressScreen />;
    case 'result':
      return <ResultScreen />;
    case 'history':
      return <HistoryScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'home':
    default:
      return <HomeScreen />;
  }
}

export function App(): ReactElement {
  const t = useTranslation();
  const screen = useAppStore((state) => state.screen);
  const setScreen = useAppStore((state) => state.setScreen);
  const locale = useAppStore((state) => state.locale);
  const setLocale = useAppStore((state) => state.setLocale);
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const error = useAppStore((state) => state.error);
  const setError = useAppStore((state) => state.setError);
  const notice = useAppStore((state) => state.notice);
  const setNotice = useAppStore((state) => state.setNotice);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (): void => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      root.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  const cycleTheme = (): void => {
    setTheme(theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system');
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            🧱
          </span>
          <div>
            <strong>{t('app.title')}</strong>
            <span className="brand__badge">{t('app.badge')}</span>
          </div>
        </div>

        <nav className="nav" aria-label={t('nav.primary')}>
          <span className="nav__group">{t('nav.primary')}</span>
          {NAV.map((item) => (
            <button
              key={item.screen}
              type="button"
              className={`nav__item${screen === item.screen ? ' is-active' : ''}`}
              aria-current={screen === item.screen ? 'page' : undefined}
              onClick={() => setScreen(item.screen)}
            >
              <span className="nav__icon" aria-hidden="true">
                {item.icon}
              </span>
              <span>{t(item.key)}</span>
            </button>
          ))}
        </nav>

        <p className="sidebar__footer">{t('settings.offline')}</p>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar__title">{t(NAV.find((item) => item.screen === screen)?.key ?? 'nav.home')}</div>
          <div className="topbar__actions">
            <button
              type="button"
              className="icon-button"
              aria-label={t('locale.toggle')}
              title={t('locale.toggle')}
              onClick={() => setLocale(locale === 'en' ? 'ja' : 'en')}
            >
              {locale === 'en' ? '日本語' : 'English'}
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={t('theme.toggle')}
              title={t('theme.toggle')}
              onClick={cycleTheme}
            >
              {THEME_ICON[theme]}
            </button>
          </div>
        </header>

        <main className="content">
          <ErrorBanner error={error} onDismiss={() => setError(null)} />
          <NoticeBanner message={notice} onDismiss={() => setNotice(null)} />
          <ScreenView screen={screen} />
        </main>
      </div>
    </div>
  );
}
