import {
  formatPackFormat,
  type ConversionOptions,
  type ConversionPlan,
  type ConversionProgress,
  type ConversionReport,
  type ConversionRunInput,
  type ConversionRunOutput,
  type FileReport,
  type LogEntry,
  type LogLevel,
  type PackAnalysis,
  type PackArchive,
  type PlanItem,
  type RuleResult,
  type RuleStatus,
  type ValidationIssue,
  type ValidationResult,
  type ValidationSummary,
} from '@rpc/core';
import { analyzeArchive } from '@rpc/analyzer';
import { applyConversion, createConversionPlan } from '@rpc/converter';
import { readFileEntries, readZip, suggestOutputName, writeZip, type FileInput } from '@rpc/archive';
import { validateArchive } from '@rpc/validator';
import { resolveVersion } from '@rpc/version-registry';
import { exportReport, type ReportFormat } from '@rpc/report';

export interface InspectResult {
  archive: PackArchive;
  analysis: PackAnalysis;
  zipSize: number;
}

/** Analyzes an already loaded archive without converting it. */
export function inspectArchive(archive: PackArchive, zipSize = 0): InspectResult {
  const analysis = analyzeArchive(archive, zipSize);
  return { archive, analysis, zipSize };
}

/** Builds a conversion plan for an already analyzed archive. */
export function buildConversionPlan(
  archive: PackArchive,
  analysis: PackAnalysis,
  targetVersionId: string,
  preserveUnknownFiles = true,
): ConversionPlan {
  const target = resolveVersion(targetVersionId);
  return createConversionPlan(archive, analysis, target.resourcePackFormat, { preserveUnknownFiles });
}

export interface ZipConversionResult {
  output: ConversionRunOutput;
  zip: Uint8Array | null;
  outputName: string;
}

export interface ZipConversionInput extends Omit<ConversionRunInput, 'archive' | 'zipSize'> {
  zip: ArrayBuffer | Uint8Array;
  name: string;
}

function emptyValidation(): ValidationResult {
  const summary: ValidationSummary = { pass: 0, warning: 0, error: 0, notChecked: 0 };
  return { issues: [], summary };
}

export function outputNameFor(archiveName: string, options: ConversionOptions): string {
  const requested = options.outputFileName?.trim();
  if (requested) {
    return /\.zip$/i.test(requested) ? requested : `${requested}.zip`;
  }
  return suggestOutputName(archiveName, options.targetVersionId);
}

function sourceVersionLabel(analysis: PackAnalysis): string {
  const matched = analysis.detection.matchedVersions[0];
  if (matched) return matched.label;
  if (analysis.detection.format) return `format ${formatPackFormat(analysis.detection.format)}`;
  return 'unknown';
}

function mapResultPath(result: RuleResult, outputPaths: ReadonlySet<string>): string | undefined {
  if (result.file && outputPaths.has(result.file)) return result.file;
  if (typeof result.after === 'string' && outputPaths.has(result.after)) return result.after;
  return result.file;
}

function statusFrom(
  results: RuleResult[],
  issues: ValidationIssue[],
  planItem: PlanItem | undefined,
): RuleStatus {
  if (results.some((result) => result.status === 'FAILED')) return 'FAILED';
  if (results.some((result) => result.status === 'UNSUPPORTED')) return 'UNSUPPORTED';
  if (planItem?.action === 'unsupported') return 'UNSUPPORTED';
  if (planItem?.action === 'preserve' || planItem?.action === 'drop') return 'SKIPPED';
  if (issues.some((issue) => issue.status === 'ERROR')) return 'FAILED';
  if (results.some((result) => result.status === 'WARNING') || issues.some((issue) => issue.status === 'WARNING')) {
    return 'WARNING';
  }
  return 'SUCCESS';
}

function buildFileReports(
  output: PackArchive,
  outputAnalysis: PackAnalysis,
  plan: ConversionPlan,
  validation: ValidationResult,
  ruleResults: RuleResult[],
): FileReport[] {
  const outputPaths = new Set(output.files.keys());
  const plansByPath = new Map(plan.items.map((item) => [item.path, item]));
  const issuesByPath = new Map<string, ValidationIssue[]>();
  for (const issue of validation.issues) {
    if (!issue.path) continue;
    const list = issuesByPath.get(issue.path) ?? [];
    list.push(issue);
    issuesByPath.set(issue.path, list);
  }
  const resultsByPath = new Map<string, RuleResult[]>();
  for (const result of ruleResults) {
    const path = mapResultPath(result, outputPaths);
    if (!path) continue;
    const list = resultsByPath.get(path) ?? [];
    list.push(result);
    resultsByPath.set(path, list);
  }
  const kinds = new Map(outputAnalysis.classifications.map((file) => [file.path, file.kind]));

  const reports: FileReport[] = [];
  for (const path of [...outputPaths].sort()) {
    const results = resultsByPath.get(path) ?? [];
    const issues = issuesByPath.get(path) ?? [];
    const planItem = plansByPath.get(path);
    const status = statusFrom(results, issues, planItem);
    const rules = new Set<string>();
    for (const result of results) rules.add(result.ruleId);
    for (const ruleId of planItem?.ruleIds ?? []) rules.add(ruleId);

    const warnings = results.filter((result) => result.status === 'WARNING').map((result) => result.message);
    warnings.push(...issues.filter((issue) => issue.status === 'WARNING').map((issue) => issue.message));
    const errors = results
      .filter((result) => result.status === 'FAILED' || result.status === 'UNSUPPORTED')
      .map((result) => result.message);
    errors.push(...issues.filter((issue) => issue.status === 'ERROR').map((issue) => issue.message));
    const notes: string[] = [];
    if (planItem?.reason) notes.push(planItem.reason);
    if (!plansByPath.has(path) && results.length > 0) notes.push('Created by the conversion.');
    for (const issue of issues) {
      if (issue.status === 'NOT_CHECKED') notes.push(issue.message);
    }

    reports.push({
      path,
      kind: kinds.get(path) ?? 'unknown',
      status,
      rules: [...rules].sort(),
      warnings,
      errors,
      notes,
    });
  }

  for (const item of plan.items) {
    if (item.action !== 'drop' || outputPaths.has(item.path)) continue;
    reports.push({
      path: item.path,
      kind: item.kind,
      status: 'SKIPPED',
      rules: item.ruleIds,
      warnings: [],
      errors: [],
      notes: [item.reason],
    });
  }

  return reports.sort((a, b) => a.path.localeCompare(b.path));
}

interface ReportInput {
  archive: PackArchive;
  analysis: PackAnalysis;
  outputArchive: PackArchive;
  outputAnalysis: PackAnalysis;
  plan: ConversionPlan;
  validation: ValidationResult;
  ruleResults: RuleResult[];
  logs: LogEntry[];
  options: ConversionOptions;
  targetLabel: string;
  startedAt: string;
  startedMs: number;
  cancelled: boolean;
}

function buildReport(input: ReportInput): ConversionReport {
  const files = buildFileReports(
    input.outputArchive,
    input.outputAnalysis,
    input.plan,
    input.validation,
    input.ruleResults,
  );
  const count = (status: RuleStatus): number => files.filter((file) => file.status === status).length;
  const finishedMs = Date.now();
  return {
    reportVersion: 1,
    resourcePackName: input.archive.name,
    sourceVersion: sourceVersionLabel(input.analysis),
    targetVersion: input.targetLabel,
    sourceFormat: input.analysis.detection.format ? formatPackFormat(input.analysis.detection.format) : null,
    targetFormat: formatPackFormat(input.plan.targetFormat),
    startedAt: input.startedAt,
    finishedAt: new Date(finishedMs).toISOString(),
    durationMs: finishedMs - input.startedMs,
    cancelled: input.cancelled,
    // Count every reported file (output files plus dropped inputs) so the total
    // always equals the sum of the status counters below.
    totalFiles: files.length,
    successCount: count('SUCCESS'),
    warningCount: count('WARNING'),
    failedCount: count('FAILED'),
    skippedCount: count('SKIPPED'),
    unsupportedCount: count('UNSUPPORTED'),
    validation: input.validation.summary,
    validationIssues: input.validation.issues,
    ruleResults: input.ruleResults,
    files,
    unknownFiles: input.analysis.unknownFiles.map((file) => file.path),
    logs: input.logs,
  };
}

function progress(
  stage: ConversionProgress['stage'],
  processed: number,
  total: number,
  callback: ((value: ConversionProgress) => void) | undefined,
  message?: string,
  currentFile?: string,
): void {
  callback?.({
    stage,
    totalFiles: total,
    processedFiles: processed,
    successfulFiles: 0,
    warningFiles: 0,
    failedFiles: 0,
    percentage: total > 0 ? Math.min(100, Math.round((processed / total) * 1000) / 10) : 0,
    ...(message ? { message } : {}),
    ...(currentFile ? { currentFile } : {}),
  });
}

/**
 * Runs the complete analysis, planning, conversion, validation and reporting
 * pipeline. The input archive is never mutated. If the caller aborts, the
 * returned report is marked as cancelled and no further rules are applied.
 */
export async function runConversion(input: ConversionRunInput): Promise<ConversionRunOutput> {
  const startedMs = Date.now();
  const startedAt = new Date(startedMs).toISOString();
  const logs: LogEntry[] = [];
  const log = (level: LogLevel, message: string, file?: string, details?: string): void => {
    if (level === 'DEBUG' && !input.options.detailedLogs) return;
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(file ? { file } : {}),
      ...(details ? { details } : {}),
    };
    logs.push(entry);
    input.onLog?.(entry);
  };

  const targetVersion = resolveVersion(input.options.targetVersionId);
  const targetFormat = targetVersion.resourcePackFormat;

  progress('reading', 0, 1, input.onProgress, 'Archive loaded');
  progress('reading', 1, 1, input.onProgress, 'Archive loaded');

  progress('analyzing', 0, 1, input.onProgress, 'Analyzing resource pack');
  const analysis = analyzeArchive(input.archive, input.zipSize);
  progress('analyzing', 1, 1, input.onProgress, 'Analysis complete');
  log(
    'INFO',
    `Detected source format: ${analysis.detection.format ? formatPackFormat(analysis.detection.format) : 'unknown'} (${analysis.detection.confidence} confidence).`,
  );
  log('INFO', `Target: ${targetVersion.label} (resource pack format ${formatPackFormat(targetFormat)}).`);

  progress('planning', 0, 1, input.onProgress, 'Building conversion plan');
  const plan = createConversionPlan(input.archive, analysis, targetFormat, {
    preserveUnknownFiles: input.options.preserveUnknownFiles,
  });
  progress('planning', 1, 1, input.onProgress, 'Conversion plan ready');
  log(
    'INFO',
    `Plan: ${plan.filesToConvert} file(s) to convert, ${plan.filesToValidate} to validate, ${plan.filesPreserved} preserved, ${plan.filesUnsupported} unsupported.`,
  );

  const converted = await applyConversion(input.archive, analysis, plan, input.options, {
    signal: input.signal,
    onProgress: input.onProgress,
    onLog: (entry) => {
      logs.push(entry);
      input.onLog?.(entry);
    },
  });

  const outputName = outputNameFor(input.archive.name, input.options);
  let outputAnalysis: PackAnalysis;
  let validation: ValidationResult;
  if (converted.cancelled) {
    outputAnalysis = analyzeArchive(converted.archive, 0);
    validation = emptyValidation();
    log('WARN', `Conversion cancelled before validation. No output file will be written (${outputName}).`);
  } else {
    progress('validating', 0, 1, input.onProgress, 'Validating converted resource pack');
    outputAnalysis = analyzeArchive(converted.archive, 0);
    validation = input.options.validateAfterConversion
      ? validateArchive(converted.archive, outputAnalysis, { targetFormat })
      : emptyValidation();
    progress('validating', 1, 1, input.onProgress, 'Validation complete');
    log(
      'INFO',
      `Validation: ${validation.summary.pass} passed, ${validation.summary.warning} warning(s), ${validation.summary.error} error(s), ${validation.summary.notChecked} not checked.`,
    );
  }

  progress('reporting', 0, 1, input.onProgress, 'Building conversion report');
  const report = buildReport({
    archive: input.archive,
    analysis,
    outputArchive: converted.archive,
    outputAnalysis,
    plan,
    validation,
    ruleResults: converted.ruleResults,
    logs,
    options: input.options,
    targetLabel: targetVersion.label,
    startedAt,
    startedMs,
    cancelled: converted.cancelled,
  });
  progress('reporting', 1, 1, input.onProgress, 'Report ready');

  if (!converted.cancelled) {
    progress('done', 1, 1, input.onProgress, `Output file name: ${outputName}`);
  }

  return {
    archive: converted.archive,
    report,
    plan,
    analysis,
    validation,
  };
}

/**
 * Converts an uploaded ZIP or folder archive and serializes the output ZIP.
 * When the run is cancelled the returned zip is null.
 */
export async function convertZip(input: ZipConversionInput): Promise<ZipConversionResult> {
  const archive = await readZip(input.zip, input.name, input.options.limits);
  const output = await runConversion({
    archive,
    zipSize: input.zip.byteLength,
    options: input.options,
    signal: input.signal,
    onProgress: input.onProgress,
    onLog: input.onLog,
  });
  const outputName = outputNameFor(archive.name, input.options);
  if (output.report.cancelled) return { output, zip: null, outputName };
  const zip = await writeZip(output.archive);
  return { output, zip, outputName };
}

export async function convertFiles(
  files: FileInput[],
  name: string,
  options: ConversionOptions,
  hooks: {
    signal?: AbortSignal;
    onProgress?: (value: ConversionProgress) => void;
    onLog?: (entry: LogEntry) => void;
  } = {},
): Promise<ZipConversionResult> {
  const archive = await readFileEntries(files, name, options.limits);
  const output = await runConversion({
    archive,
    zipSize: 0,
    options,
    signal: hooks.signal,
    onProgress: hooks.onProgress,
    onLog: hooks.onLog,
  });
  const outputName = outputNameFor(archive.name, options);
  if (output.report.cancelled) return { output, zip: null, outputName };
  const zip = await writeZip(output.archive);
  return { output, zip, outputName };
}

export function serializeReport(
  report: ConversionReport,
  format: ReportFormat,
  locale: 'en' | 'ja' = 'en',
): string {
  return exportReport(report, format, locale);
}

export type { FileInput, ReportFormat };
