import { sanitizeFileNameBase, type ConversionReport, type FileReport, type RuleResult, type ValidationIssue } from '@rpc/core';

export type ReportFormat = 'json' | 'html' | 'txt' | 'csv';
export type ReportLocale = 'en' | 'ja';

const LABELS = {
  en: {
    title: 'ResourcePack Converter Report',
    generated: 'Generated',
    source: 'Source',
    target: 'Target',
    duration: 'Duration',
    status: 'Status',
    totals: 'Totals',
    totalFiles: 'Total files',
    success: 'Success',
    warnings: 'Warnings',
    failures: 'Failures',
    skipped: 'Skipped',
    unsupported: 'Unsupported',
    validation: 'Validation',
    pass: 'Pass',
    error: 'Errors',
    notChecked: 'Not checked',
    rules: 'Applied rules',
    files: 'Files',
    validationIssues: 'Validation issues',
    logs: 'Log',
    cancelled: 'Cancelled',
    yes: 'yes',
    no: 'no',
    noEntries: 'No entries.',
    path: 'Path',
    kind: 'Kind',
    notes: 'Notes',
    reason: 'Reason',
  },
  ja: {
    title: 'ResourcePack Converter 変換レポート',
    generated: '生成日時',
    source: '変換元',
    target: '変換先',
    duration: '所要時間',
    status: '状態',
    totals: '集計',
    totalFiles: '総ファイル数',
    success: '成功',
    warnings: '警告',
    failures: '失敗',
    skipped: 'スキップ',
    unsupported: '未対応',
    validation: '検証',
    pass: '合格',
    error: 'エラー',
    notChecked: '未検査',
    rules: '適用ルール',
    files: 'ファイル',
    validationIssues: '検証結果',
    logs: 'ログ',
    cancelled: 'キャンセル',
    yes: 'はい',
    no: 'いいえ',
    noEntries: '項目はありません。',
    path: 'パス',
    kind: '種類',
    notes: '備考',
    reason: '理由',
  },
} as const;

type Labels = (typeof LABELS)[ReportLocale];

function labels(locale: ReportLocale): Labels {
  return LABELS[locale] ?? LABELS.en;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function statusClass(status: string): string {
  switch (status) {
    case 'SUCCESS':
    case 'PASS':
      return 'ok';
    case 'WARNING':
      return 'warn';
    case 'FAILED':
    case 'UNSUPPORTED':
    case 'ERROR':
      return 'err';
    default:
      return 'muted';
  }
}

function sortedFiles(report: ConversionReport): FileReport[] {
  return [...report.files].sort((a, b) => a.path.localeCompare(b.path));
}

function ruleSummary(rule: RuleResult): string {
  return `${rule.ruleName}: ${rule.message}`;
}

export function toJsonReport(report: ConversionReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function toCsvReport(report: ConversionReport, locale: ReportLocale = 'en'): string {
  const l = labels(locale);
  const rows: string[] = [];
  rows.push([l.path, l.kind, l.status, 'Rules', l.warnings, l.failures, l.notes].map(csvCell).join(','));
  for (const file of sortedFiles(report)) {
    rows.push(
      [
        file.path,
        file.kind,
        file.status,
        file.rules.join(' | '),
        file.warnings.join(' | '),
        file.errors.join(' | '),
        file.notes.join(' | '),
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return `\uFEFF${rows.join('\r\n')}\r\n`;
}

export function toTextReport(report: ConversionReport, locale: ReportLocale = 'en'): string {
  const l = labels(locale);
  const lines: string[] = [];
  lines.push(l.title);
  lines.push('='.repeat(l.title.length));
  lines.push(`${l.generated}: ${report.finishedAt}`);
  lines.push(`${l.source}: ${report.sourceVersion} (format ${report.sourceFormat ?? 'unknown'})`);
  lines.push(`${l.target}: ${report.targetVersion} (format ${report.targetFormat})`);
  lines.push(`${l.duration}: ${report.durationMs} ms`);
  lines.push(`${l.cancelled}: ${report.cancelled ? l.yes : l.no}`);
  lines.push('');
  lines.push(`${l.totals}:`);
  lines.push(`  ${l.totalFiles}: ${report.totalFiles}`);
  lines.push(`  ${l.success}: ${report.successCount}`);
  lines.push(`  ${l.warnings}: ${report.warningCount}`);
  lines.push(`  ${l.failures}: ${report.failedCount}`);
  lines.push(`  ${l.skipped}: ${report.skippedCount}`);
  lines.push(`  ${l.unsupported}: ${report.unsupportedCount}`);
  lines.push('');
  lines.push(`${l.validation}:`);
  lines.push(`  ${l.pass}: ${report.validation.pass}`);
  lines.push(`  ${l.warnings}: ${report.validation.warning}`);
  lines.push(`  ${l.error}: ${report.validation.error}`);
  lines.push(`  ${l.notChecked}: ${report.validation.notChecked}`);
  lines.push('');

  lines.push(`${l.rules}:`);
  if (report.ruleResults.length === 0) lines.push(`  ${l.noEntries}`);
  for (const rule of report.ruleResults) lines.push(`  [${rule.status}] ${ruleSummary(rule)}`);
  lines.push('');

  lines.push(`${l.files}:`);
  if (report.files.length === 0) lines.push(`  ${l.noEntries}`);
  for (const file of sortedFiles(report)) {
    lines.push(`  [${file.status}] ${file.path} (${file.kind})`);
    if (file.rules.length > 0) lines.push(`    rules: ${file.rules.join(', ')}`);
    for (const warning of file.warnings) lines.push(`    warning: ${warning}`);
    for (const error of file.errors) lines.push(`    error: ${error}`);
    for (const note of file.notes) lines.push(`    note: ${note}`);
  }
  lines.push('');

  lines.push(`${l.validationIssues}:`);
  if (report.validationIssues.length === 0) lines.push(`  ${l.noEntries}`);
  for (const issue of report.validationIssues) {
    lines.push(`  [${issue.status}] ${issue.path ?? '-'} ${issue.code}: ${issue.message}`);
    if (issue.details) lines.push(`    ${issue.details}`);
  }
  lines.push('');

  lines.push(`${l.logs}:`);
  if (report.logs.length === 0) lines.push(`  ${l.noEntries}`);
  for (const entry of report.logs) {
    lines.push(`  ${entry.timestamp} [${entry.level}] ${entry.message}${entry.file ? ` (${entry.file})` : ''}`);
    if (entry.details) lines.push(`    ${entry.details}`);
  }
  return `${lines.join('\n')}\n`;
}

function htmlTableRows(items: string[][]): string {
  return items.map((cells) => `<tr>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('\n');
}

export function toHtmlReport(report: ConversionReport, locale: ReportLocale = 'en'): string {
  const l = labels(locale);
  const fileRows = sortedFiles(report).map((file) => [
    `<code>${escapeHtml(file.path)}</code>`,
    escapeHtml(file.kind),
    `<span class="badge ${statusClass(file.status)}">${escapeHtml(file.status)}</span>`,
    escapeHtml(file.rules.join(', ')),
    escapeHtml(file.warnings.join('\n')),
    escapeHtml(file.errors.join('\n')),
    escapeHtml(file.notes.join('\n')),
  ]);

  const validationRows = report.validationIssues.map((issue: ValidationIssue) => [
    `<code>${escapeHtml(issue.path ?? '-')}</code>`,
    `<span class="badge ${statusClass(issue.status)}">${escapeHtml(issue.status)}</span>`,
    escapeHtml(issue.code),
    escapeHtml(issue.message),
    escapeHtml(issue.details ?? ''),
  ]);

  const ruleRows = report.ruleResults.map((rule) => [
    `<span class="badge ${statusClass(rule.status)}">${escapeHtml(rule.status)}</span>`,
    escapeHtml(rule.ruleName),
    escapeHtml(rule.message),
    `<code>${escapeHtml(rule.file ?? '')}</code>`,
  ]);

  const logRows = report.logs.map((entry) => [
    escapeHtml(entry.timestamp),
    escapeHtml(entry.level),
    escapeHtml(entry.message),
    `<code>${escapeHtml(entry.file ?? '')}</code>`,
  ]);

  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(l.title)}</title>
<style>
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body { margin: 0; padding: 2rem; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; line-height: 1.5; background: #f6f7f9; color: #1b1f24; }
h1 { margin-top: 0; font-size: 1.6rem; }
h2 { margin-top: 2rem; font-size: 1.15rem; border-bottom: 1px solid #d8dde3; padding-bottom: .35rem; }
.meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: .5rem 1.5rem; margin: 1rem 0; }
.meta div { background: #fff; border: 1px solid #e1e4e8; border-radius: 8px; padding: .6rem .8rem; }
.meta span { display: block; font-size: .75rem; text-transform: uppercase; letter-spacing: .04em; color: #5b6570; }
.summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: .75rem; margin: 1rem 0; }
.card { background: #fff; border: 1px solid #e1e4e8; border-radius: 8px; padding: .75rem; }
.card strong { display: block; font-size: 1.4rem; }
table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e1e4e8; border-radius: 8px; overflow: hidden; margin: 1rem 0; font-size: .875rem; }
th, td { text-align: left; vertical-align: top; padding: .5rem .65rem; border-bottom: 1px solid #eef0f2; white-space: pre-wrap; word-break: break-word; }
th { background: #f1f3f5; font-weight: 600; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .82em; }
.badge { display: inline-block; padding: .1rem .45rem; border-radius: 999px; font-size: .72rem; font-weight: 700; }
.badge.ok { background: #d9f4e3; color: #11643a; }
.badge.warn { background: #fff1c9; color: #7a4d00; }
.badge.err { background: #fde0e0; color: #8f1d1d; }
.badge.muted { background: #eceff2; color: #4d5761; }
details { margin: 1rem 0; }
summary { cursor: pointer; font-weight: 600; }
@media (prefers-color-scheme: dark) {
  body { background: #13171c; color: #e6e9ed; }
  .meta div, .card, table { background: #1b2027; border-color: #2b333d; }
  th { background: #222a33; }
  th, td { border-bottom-color: #2b333d; }
  h2 { border-bottom-color: #2b333d; }
  .meta span { color: #9aa5b1; }
  .badge.ok { background: #123a26; color: #8fe0b0; }
  .badge.warn { background: #3d2f0a; color: #f0cf7a; }
  .badge.err { background: #3d1616; color: #f3a0a0; }
  .badge.muted { background: #262e37; color: #aab4bf; }
}
</style>
</head>
<body>
<h1>${escapeHtml(l.title)}</h1>
<div class="meta">
  <div><span>${escapeHtml(l.generated)}</span>${escapeHtml(report.finishedAt)}</div>
  <div><span>${escapeHtml(l.source)}</span>${escapeHtml(report.sourceVersion)} (${escapeHtml(report.sourceFormat ?? 'unknown')})</div>
  <div><span>${escapeHtml(l.target)}</span>${escapeHtml(report.targetVersion)} (${escapeHtml(report.targetFormat)})</div>
  <div><span>${escapeHtml(l.duration)}</span>${escapeHtml(report.durationMs)} ms</div>
  <div><span>${escapeHtml(l.status)}</span>${escapeHtml(report.cancelled ? l.cancelled : l.success)}</div>
</div>
<div class="summary">
  <div class="card"><span>${escapeHtml(l.totalFiles)}</span><strong>${report.totalFiles}</strong></div>
  <div class="card"><span>${escapeHtml(l.success)}</span><strong>${report.successCount}</strong></div>
  <div class="card"><span>${escapeHtml(l.warnings)}</span><strong>${report.warningCount}</strong></div>
  <div class="card"><span>${escapeHtml(l.failures)}</span><strong>${report.failedCount}</strong></div>
  <div class="card"><span>${escapeHtml(l.unsupported)}</span><strong>${report.unsupportedCount}</strong></div>
  <div class="card"><span>${escapeHtml(l.validation)} ${escapeHtml(l.error)}</span><strong>${report.validation.error}</strong></div>
</div>
<h2>${escapeHtml(l.files)}</h2>
<table>
<thead><tr><th>${escapeHtml(l.path)}</th><th>${escapeHtml(l.kind)}</th><th>${escapeHtml(l.status)}</th><th>Rules</th><th>${escapeHtml(l.warnings)}</th><th>${escapeHtml(l.failures)}</th><th>${escapeHtml(l.notes)}</th></tr></thead>
<tbody>
${htmlTableRows(fileRows)}
</tbody>
</table>
<h2>${escapeHtml(l.validationIssues)}</h2>
<table>
<thead><tr><th>${escapeHtml(l.path)}</th><th>${escapeHtml(l.status)}</th><th>Code</th><th>${escapeHtml(l.reason)}</th><th>Details</th></tr></thead>
<tbody>
${htmlTableRows(validationRows)}
</tbody>
</table>
<h2>${escapeHtml(l.rules)}</h2>
<table>
<thead><tr><th>${escapeHtml(l.status)}</th><th>Rule</th><th>${escapeHtml(l.reason)}</th><th>${escapeHtml(l.path)}</th></tr></thead>
<tbody>
${htmlTableRows(ruleRows)}
</tbody>
</table>
<h2>${escapeHtml(l.logs)}</h2>
<details>
<summary>${escapeHtml(l.logs)} (${report.logs.length})</summary>
<table>
<thead><tr><th>Time</th><th>Level</th><th>Message</th><th>${escapeHtml(l.path)}</th></tr></thead>
<tbody>
${htmlTableRows(logRows)}
</tbody>
</table>
</details>
</body>
</html>
`;
}

export function exportReport(
  report: ConversionReport,
  format: ReportFormat,
  locale: ReportLocale = 'en',
): string {
  switch (format) {
    case 'json':
      return toJsonReport(report);
    case 'html':
      return toHtmlReport(report, locale);
    case 'csv':
      return toCsvReport(report, locale);
    case 'txt':
    default:
      return toTextReport(report, locale);
  }
}

export function reportMimeType(format: ReportFormat): string {
  switch (format) {
    case 'json':
      return 'application/json;charset=utf-8';
    case 'html':
      return 'text/html;charset=utf-8';
    case 'csv':
      return 'text/csv;charset=utf-8';
    case 'txt':
    default:
      return 'text/plain;charset=utf-8';
  }
}

export function reportExtension(format: ReportFormat): string {
  return format === 'txt' ? 'txt' : format;
}

/** Builds a filesystem-safe report file name. */
export function reportFileName(packName: string, format: ReportFormat, targetVersion: string): string {
  const base = sanitizeFileNameBase(packName.replace(/\.zip$/i, ''));
  return `${base}-${targetVersion}-report.${reportExtension(format)}`;
}
