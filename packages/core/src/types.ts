import type { PackFormat } from './format';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  file?: string;
  details?: string;
}

export type RuleStatus = 'SUCCESS' | 'SKIPPED' | 'WARNING' | 'FAILED' | 'UNSUPPORTED';

export type ValidationStatus = 'PASS' | 'WARNING' | 'ERROR' | 'NOT_CHECKED';

export type FileKind =
  | 'pack-mcmeta'
  | 'pack-png'
  | 'model'
  | 'blockstate'
  | 'item-definition'
  | 'texture'
  | 'texture-meta'
  | 'sound-definition'
  | 'sound'
  | 'font'
  | 'shader'
  | 'atlas'
  | 'lang'
  | 'particle'
  | 'gui'
  | 'data'
  | 'optifine'
  | 'unknown';

export interface PackEntry {
  /** Normalized, forward-slash relative path inside the pack root. */
  path: string;
  data: Uint8Array;
}

export interface PackArchive {
  name: string;
  files: Map<string, Uint8Array>;
  totalUncompressedSize: number;
}

export interface ArchiveLimits {
  maxZipBytes: number;
  maxTotalUncompressedBytes: number;
  maxFileCount: number;
  maxSingleFileBytes: number;
  maxCompressionRatio: number;
}

export const DEFAULT_ARCHIVE_LIMITS: ArchiveLimits = {
  maxZipBytes: 256 * 1024 * 1024,
  maxTotalUncompressedBytes: 1024 * 1024 * 1024,
  maxFileCount: 20_000,
  maxSingleFileBytes: 128 * 1024 * 1024,
  maxCompressionRatio: 500,
};

export interface MinecraftVersionInfo {
  /** Representative release, e.g. "1.21.4". */
  id: string;
  /** Display label for a version family, e.g. "1.20.3 – 1.20.4". */
  label: string;
  versions: string[];
  resourcePackFormat: PackFormat;
  dataPackFormat?: PackFormat;
  notes?: string[];
  source: string;
}

export interface PackMcmeta {
  raw: Record<string, unknown>;
  description?: unknown;
  packFormat?: PackFormat;
  supportedFormatRange?: { min: PackFormat; max: PackFormat };
  minFormat?: PackFormat;
  maxFormat?: PackFormat;
  overlays?: unknown[];
}

export type DetectionConfidence = 'high' | 'medium' | 'low' | 'unknown';

export interface DetectionResult {
  format: PackFormat | null;
  formatRange: { min: PackFormat; max: PackFormat } | null;
  mcmeta: PackMcmeta | null;
  matchedVersions: MinecraftVersionInfo[];
  confidence: DetectionConfidence;
  reasons: string[];
}

export interface FileClassification {
  path: string;
  kind: FileKind;
  size: number;
  namespace?: string;
}

export type DependencyKind =
  | 'model-parent'
  | 'model-texture'
  | 'blockstate-model'
  | 'item-definition-model'
  | 'sound-file'
  | 'font-file'
  | 'atlas-source'
  | 'other';

export interface DependencyEdge {
  from: string;
  to: string;
  kind: DependencyKind;
  exists: boolean;
}

export interface PackAnalysis {
  name: string;
  fileCount: number;
  directoryCount: number;
  totalUncompressedSize: number;
  zipSize: number;
  jsonCount: number;
  pngCount: number;
  oggCount: number;
  modelCount: number;
  itemDefinitionCount: number;
  blockstateCount: number;
  textureCount: number;
  soundCount: number;
  fontCount: number;
  shaderCount: number;
  unknownCount: number;
  namespaces: string[];
  hasPackMcmeta: boolean;
  hasPackPng: boolean;
  detection: DetectionResult;
  classifications: FileClassification[];
  unknownFiles: FileClassification[];
  dependencies: DependencyEdge[];
  missingReferences: DependencyEdge[];
}

export interface RuleResult {
  ruleId: string;
  ruleName: string;
  status: RuleStatus;
  file?: string;
  message: string;
  details?: string;
  before?: unknown;
  after?: unknown;
}

export type PlanAction =
  | 'convert'
  | 'validate'
  | 'preserve'
  | 'regenerate'
  | 'unsupported'
  | 'drop';

export interface PlanItem {
  path: string;
  kind: FileKind;
  action: PlanAction;
  ruleIds: string[];
  reason: string;
}

export interface AppliedRuleInfo {
  id: string;
  name: string;
  description: string;
  source: string;
}

export interface ConversionPlan {
  sourceFormat: PackFormat | null;
  targetFormat: PackFormat;
  sourceLabel: string;
  targetLabel: string;
  totalFiles: number;
  filesToConvert: number;
  filesToValidate: number;
  filesPreserved: number;
  filesUnsupported: number;
  items: PlanItem[];
  rules: AppliedRuleInfo[];
  expectedWarnings: string[];
}

export type RuleKind = 'conversion' | 'validation' | 'preservation';

export interface RuleMetadata {
  id: string;
  name: string;
  description: string;
  kind: RuleKind;
  /** Format at which the change documented by this rule was introduced. */
  introducedIn: PackFormat;
  /** Inclusive lower bound of the target format this rule applies to (null = no bound). */
  appliesFrom?: PackFormat | null;
  /** Inclusive upper bound of the target format this rule applies to (null = no bound). */
  appliesTo?: PackFormat | null;
  source: string;
}

export interface ValidationIssue {
  path?: string;
  status: ValidationStatus;
  code: string;
  message: string;
  details?: string;
}

export interface ValidationSummary {
  pass: number;
  warning: number;
  error: number;
  notChecked: number;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  summary: ValidationSummary;
}

export interface FileReport {
  path: string;
  kind: FileKind;
  status: RuleStatus;
  rules: string[];
  warnings: string[];
  errors: string[];
  notes: string[];
}

export interface ConversionReport {
  reportVersion: 1;
  resourcePackName: string;
  sourceVersion: string;
  targetVersion: string;
  sourceFormat: string | null;
  targetFormat: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  cancelled: boolean;
  totalFiles: number;
  successCount: number;
  warningCount: number;
  failedCount: number;
  skippedCount: number;
  unsupportedCount: number;
  validation: ValidationSummary;
  validationIssues: ValidationIssue[];
  ruleResults: RuleResult[];
  files: FileReport[];
  unknownFiles: string[];
  logs: LogEntry[];
}

export interface ConversionProgress {
  stage:
    | 'reading'
    | 'analyzing'
    | 'planning'
    | 'converting'
    | 'validating'
    | 'reporting'
    | 'writing'
    | 'done';
  totalFiles: number;
  processedFiles: number;
  successfulFiles: number;
  warningFiles: number;
  failedFiles: number;
  currentFile?: string;
  percentage: number;
  message?: string;
}

export interface ConversionOptions {
  targetVersionId: string;
  limits: ArchiveLimits;
  validateAfterConversion: boolean;
  preserveUnknownFiles: boolean;
  outputFileName?: string;
  detailedLogs: boolean;
}

export interface ConversionRunInput {
  archive: PackArchive;
  zipSize: number;
  options: ConversionOptions;
  signal?: AbortSignal;
  onProgress?: (progress: ConversionProgress) => void;
  onLog?: (entry: LogEntry) => void;
}

export interface ConversionRunOutput {
  archive: PackArchive;
  report: ConversionReport;
  plan: ConversionPlan;
  analysis: PackAnalysis;
  validation: ValidationResult;
}

export interface ConversionHistoryEntry {
  id: string;
  packName: string;
  sourceVersion: string;
  targetVersion: string;
  executedAt: string;
  durationMs: number;
  status: 'success' | 'warning' | 'failed' | 'cancelled';
  warnings: number;
  errors: number;
}
