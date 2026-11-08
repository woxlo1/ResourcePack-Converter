import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactElement,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';
import type { LogEntry } from '@rpc/core';
import { translateError } from './i18n';
import { formatDate } from './format';
import { useAppStore, useTranslation } from './store';
import type { UiError } from './types';

export type Tone = 'ok' | 'warn' | 'err' | 'muted' | 'info';

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
}): ReactElement {
  return (
    <button
      type={type}
      className={`button button--${variant} button--${size} ${className}`.trim()}
      {...props}
    />
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  className = '',
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <section className={`card ${className}`.trim()}>
      {(title || description || actions) && (
        <header className="card__header">
          <div>
            {title && <h2 className="card__title">{title}</h2>}
            {description && <p className="card__description">{description}</p>}
          </div>
          {actions && <div className="card__actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Badge({ tone = 'muted', children }: { tone?: Tone; children: ReactNode }): ReactElement {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function ProgressBar({
  value,
  tone = 'info',
  label,
}: {
  value: number;
  tone?: Tone;
  label?: string;
}): ReactElement {
  const safe = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  return (
    <div
      className={`progress progress--${tone}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(safe)}
      aria-label={label}
    >
      <div className="progress__bar" style={{ width: `${safe}%` }} />
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }): ReactElement {
  return <div className="stat-grid">{children}</div>;
}

export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
}): ReactElement {
  return (
    <div className={`stat${tone ? ` stat--${tone}` : ''}`}>
      <span className="stat__label">{label}</span>
      <span className="stat__value">{value}</span>
      {hint && <span className="stat__hint">{hint}</span>}
    </div>
  );
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div className="field">
      <label className="field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <p className="field__hint">{hint}</p>}
    </div>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>): ReactElement {
  return <input className="input" {...props} />;
}

export function NumberInput(props: InputHTMLAttributes<HTMLInputElement>): ReactElement {
  return <input className="input" inputMode="numeric" {...props} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>): ReactElement {
  return <select className="input input--select" {...props} />;
}

export function Checkbox({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }): ReactElement {
  return (
    <label className="checkbox">
      <input type="checkbox" {...props} />
      <span>
        <span className="checkbox__label">{label}</span>
        {hint && <span className="checkbox__hint">{hint}</span>}
      </span>
    </label>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  ariaLabel: string;
}): ReactElement {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`segmented__item${option.value === value ? ' is-active' : ''}`}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs({
  items,
  value,
  onChange,
}: {
  items: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}): ReactElement {
  return (
    <div className="tabs" role="tablist">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={item.id === value}
          className={`tabs__item${item.id === value ? ' is-active' : ''}`}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}): ReactElement {
  return (
    <div className="empty">
      <p className="empty__title">{title}</p>
      {body && <p className="empty__body">{body}</p>}
      {action && <div className="empty__action">{action}</div>}
    </div>
  );
}

export function ErrorBanner({
  error,
  onDismiss,
}: {
  error: UiError | null;
  onDismiss: () => void;
}): ReactElement | null {
  const locale = useAppStore((state) => state.locale);
  const t = useTranslation();
  if (!error) return null;
  const message =
    error.messageKey && error.messageKey !== 'error.internal'
      ? translateError(locale, error.messageKey, error.message)
      : (error.message ?? t('errors.unknown'));
  return (
    <div className="banner banner--error" role="alert">
      <div>
        <strong>{t('errors.title')}</strong>
        <p>{message}</p>
        {error.details && <pre className="banner__details">{error.details}</pre>}
      </div>
      <Button variant="ghost" size="sm" onClick={onDismiss}>
        {t('errors.dismiss')}
      </Button>
    </div>
  );
}

export function NoticeBanner({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss: () => void;
}): ReactElement | null {
  const t = useTranslation();
  if (!message) return null;
  return (
    <div className="banner banner--notice" role="status">
      <span>{message}</span>
      <Button variant="ghost" size="sm" onClick={onDismiss}>
        {t('common.close')}
      </Button>
    </div>
  );
}

export function DefinitionList({
  items,
}: {
  items: { term: string; description: ReactNode }[];
}): ReactElement {
  return (
    <dl className="definitions">
      {items.map((item) => (
        <div key={item.term} className="definitions__row">
          <dt>{item.term}</dt>
          <dd>{item.description}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ChipList({
  values,
  empty,
}: {
  values: string[];
  empty: string;
}): ReactElement {
  if (values.length === 0) return <p className="muted">{empty}</p>;
  return (
    <div className="chips">
      {values.map((value) => (
        <span key={value} className="chip">
          {value}
        </span>
      ))}
    </div>
  );
}

export function LogList({ logs, empty }: { logs: LogEntry[]; empty: string }): ReactElement {
  const locale = useAppStore((state) => state.locale);
  if (logs.length === 0) return <p className="muted">{empty}</p>;
  return (
    <ul className="logs">
      {logs.map((entry, index) => (
        <li key={`${entry.timestamp}-${index}`} className={`log log--${entry.level.toLowerCase()}`}>
          <span className="log__time">{formatDate(entry.timestamp, locale)}</span>
          <span className="log__level">{entry.level}</span>
          <span className="log__message">
            {entry.message}
            {entry.file && <span className="log__file">{entry.file}</span>}
            {entry.details && <span className="log__details">{entry.details}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ScreenHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}): ReactElement {
  return (
    <header className="screen-header">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="screen-header__actions">{actions}</div>}
    </header>
  );
}
