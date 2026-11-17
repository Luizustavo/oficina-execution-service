import { InvalidMessageException } from '@shared/exceptions/domain.exceptions';

export const RETRY_DELAYS_MS = [5_000, 30_000, 120_000] as const;

export type FailureDecision =
  | { action: 'retry'; attempt: number; retryQueue: string }
  | { action: 'dead-letter' }
  | { action: 'reject' };

export function retryQueueName(queue: string, attempt: number): string {
  return `${queue}.retry.${attempt}`;
}

export function deadLetterQueueName(queue: string): string {
  return `${queue}.dlq`;
}

export function decideOnFailure(
  queue: string,
  retryCount: number,
  error: unknown,
): FailureDecision {
  if (error instanceof InvalidMessageException) {
    return { action: 'reject' };
  }
  const attempt = Math.max(0, Math.floor(retryCount)) + 1;
  if (attempt > RETRY_DELAYS_MS.length) {
    return { action: 'dead-letter' };
  }
  return {
    action: 'retry',
    attempt,
    retryQueue: retryQueueName(queue, attempt),
  };
}
