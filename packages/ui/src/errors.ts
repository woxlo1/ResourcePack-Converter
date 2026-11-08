import { toUserMessage } from '@rpc/core';
import { WorkerRequestError } from './worker-client';
import type { UiError } from './types';

/** Converts any thrown value into a UI-safe error with a translated message key. */
export function toUiError(error: unknown): UiError {
  if (error instanceof WorkerRequestError) {
    return {
      code: error.code,
      messageKey: error.messageKey,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    };
  }
  if (error instanceof Error) {
    const user = toUserMessage(error);
    return {
      code: user.code,
      messageKey: user.messageKey,
      message: error.message,
      ...(user.details ? { details: user.details } : {}),
    };
  }
  return {
    code: 'INTERNAL',
    messageKey: 'error.internal',
    message: String(error),
  };
}
