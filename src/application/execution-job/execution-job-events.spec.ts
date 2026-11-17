import { ExecutionJobEntity } from '@domain/entities/execution-job/execution-job.entity';
import {
  ExecutionFailureReason,
  ExecutionPriority,
} from '@domain/enums/execution-job.enum';
import { SagaExchange } from '@domain/messaging/saga-message';
import { ExecutionJobEvents } from './execution-job-events';

const job = () =>
  ExecutionJobEntity.create(
    {
      orderId: 'order-1',
      sagaId: 'saga-1',
      orderNumber: 'OS-2026-000123',
      vehiclePlate: 'ABC1D23',
      priority: ExecutionPriority.NORMAL,
      services: [{ name: 'Troca de óleo', quantity: 1 }],
      parts: [],
    },
    'job-1',
  );

describe('ExecutionJobEvents', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-11-17T10:00:00.000Z') });
  });

  afterEach(() => jest.useRealTimers());

  it('builds queued on saga.events with the job saga and order', () => {
    const event = ExecutionJobEvents.queued(job());

    expect(event.exchange).toBe(SagaExchange.EVENTS);
    expect(event.routingKey).toBe('execution.job.queued');
    expect(event.envelope).toMatchObject({
      sagaId: 'saga-1',
      orderId: 'order-1',
      type: 'execution.job.queued',
      version: 1,
      payload: { jobId: 'job-1', queuedAt: '2026-11-17T10:00:00.000Z' },
    });
  });

  it('builds started, completed and failed from the job state', () => {
    const repaired = job();
    repaired.startDiagnosis('mechanic-1');
    repaired.startRepair('mechanic-1');
    jest.setSystemTime(new Date('2026-11-17T11:30:00.000Z'));
    repaired.finish('mechanic-1');

    expect(ExecutionJobEvents.started(repaired).envelope.payload).toEqual({
      jobId: 'job-1',
      mechanicId: 'mechanic-1',
      startedAt: '2026-11-17T10:00:00.000Z',
    });
    expect(ExecutionJobEvents.completed(repaired).envelope.payload).toEqual({
      jobId: 'job-1',
      completedAt: '2026-11-17T11:30:00.000Z',
      durationSeconds: 5400,
    });

    const failed = job();
    failed.fail(
      'mechanic-1',
      ExecutionFailureReason.PART_UNAVAILABLE,
      'Sem filtro',
    );
    expect(ExecutionJobEvents.failed(failed).envelope.payload).toEqual({
      jobId: 'job-1',
      reason: 'PART_UNAVAILABLE',
      detail: 'Sem filtro',
      failedAt: '2026-11-17T11:30:00.000Z',
    });
  });

  it('answers a cancel with the command saga, even for a job that was not canceled', () => {
    const done = job();
    const event = ExecutionJobEvents.canceled(
      { sagaId: 'saga-2', orderId: 'order-1' },
      done,
    );

    expect(event.envelope.sagaId).toBe('saga-2');
    expect(event.envelope.payload).toEqual({
      jobId: 'job-1',
      canceledAt: '2026-11-17T10:00:00.000Z',
    });
  });
});
