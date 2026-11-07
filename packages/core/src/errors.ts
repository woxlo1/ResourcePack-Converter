export type ErrorCode =
  | 'INVALID_ZIP'
  | 'ZIP_TOO_LARGE'
  | 'ZIP_TOO_MANY_FILES'
  | 'ZIP_BOMB_SUSPECTED'
  | 'UNSAFE_PATH'
  | 'DUPLICATE_ENTRY'
  | 'FILE_TOO_LARGE'
  | 'PACK_MCMETA_MISSING'
  | 'PACK_MCMETA_INVALID'
  | 'VERSION_NOT_DETECTED'
  | 'TARGET_VERSION_UNKNOWN'
  | 'CONVERSION_FAILED'
  | 'VALIDATION_FAILED'
  | 'CANCELLED'
  | 'OUTPUT_FAILED'
  | 'HISTORY_FAILED'
  | 'INTERNAL';

/**
 * Error carrying a stable machine-readable code and a user-safe message key.
 * The UI never displays raw stack traces; details are written to the log.
 */
export class RpcError extends Error {
  readonly code: ErrorCode;
  readonly messageKey: string;
  readonly details?: string;

  constructor(code: ErrorCode, messageKey: string, message?: string, details?: string) {
    super(message ?? messageKey);
    this.name = 'RpcError';
    this.code = code;
    this.messageKey = messageKey;
    this.details = details;
  }
}

export class CancelledError extends RpcError {
  constructor(message = 'Conversion cancelled by the user') {
    super('CANCELLED', 'error.cancelled', message);
    this.name = 'CancelledError';
  }
}

export function isCancelled(error: unknown): boolean {
  return error instanceof CancelledError || (error instanceof RpcError && error.code === 'CANCELLED');
}

export function errorDetails(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function toUserMessage(error: unknown): { code: ErrorCode; messageKey: string; details?: string } {
  if (error instanceof RpcError) {
    return { code: error.code, messageKey: error.messageKey, details: error.details };
  }
  return { code: 'INTERNAL', messageKey: 'error.internal', details: errorDetails(error) };
}
