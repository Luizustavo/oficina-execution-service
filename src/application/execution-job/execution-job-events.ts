import { ExecutionJobEntity } from '@domain/entities/execution-job/execution-job.entity';
import {
  buildSagaEvent,
  OutgoingMessage,
  SagaEnvelope,
} from '@domain/messaging/saga-message';
import { randomUUID } from 'node:crypto';

type SagaRef = Pick<SagaEnvelope, 'sagaId' | 'orderId'>;

const event = (
  saga: SagaRef,
  type: string,
  payload: Record<string, unknown>,
): OutgoingMessage =>
  buildSagaEvent({
    messageId: randomUUID(),
    command: saga,
    type,
    occurredAt: new Date(),
    payload,
  });

const sagaOf = (job: ExecutionJobEntity): SagaRef => ({
  sagaId: job.sagaId,
  orderId: job.orderId,
});

const iso = (date: Date | undefined): string =>
  (date ?? new Date()).toISOString();

export const ExecutionJobEvents = {
  queued: (job: ExecutionJobEntity): OutgoingMessage =>
    event(sagaOf(job), 'execution.job.queued', {
      jobId: job.id,
      queuedAt: iso(job.createdAt),
    }),

  started: (job: ExecutionJobEntity): OutgoingMessage =>
    event(sagaOf(job), 'execution.job.started', {
      jobId: job.id,
      mechanicId: job.mechanicId,
      startedAt: iso(job.startedAt),
    }),

  completed: (job: ExecutionJobEntity): OutgoingMessage =>
    event(sagaOf(job), 'execution.job.completed', {
      jobId: job.id,
      completedAt: iso(job.completedAt),
      durationSeconds: job.durationSeconds,
    }),

  failed: (job: ExecutionJobEntity): OutgoingMessage =>
    event(sagaOf(job), 'execution.job.failed', {
      jobId: job.id,
      reason: job.failureReason,
      detail: job.failureDetail,
      failedAt: iso(job.failedAt),
    }),

  /** Responde ao comando, mesmo que o job já estivesse encerrado: a saga espera a confirmação para seguir. */
  canceled: (command: SagaRef, job: ExecutionJobEntity): OutgoingMessage =>
    event(command, 'execution.job.canceled', {
      jobId: job.id,
      canceledAt: iso(job.canceledAt),
    }),
};
