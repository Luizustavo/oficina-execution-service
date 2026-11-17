import {
  ExecutionFailureReason,
  ExecutionJobStatus,
  ExecutionPriority,
} from '@domain/enums/execution-job.enum';
import {
  InvalidMessageException,
  InvalidStatusTransitionException,
  NotFoundException,
} from '@shared/exceptions/domain.exceptions';
import { IExecutionJobRepository } from '@domain/repositories/execution-job.repository.interface';
import { ExecutionJobEntity } from '@domain/entities/execution-job/execution-job.entity';
import { OutgoingMessage, SagaEnvelope } from '@domain/messaging/saga-message';
import { EnqueueExecutionJobUseCase } from './enqueue-execution-job.use-case';
import { CancelExecutionJobUseCase } from './cancel-execution-job.use-case';
import { FinishExecutionJobUseCase } from './finish-execution-job.use-case';
import { ListExecutionQueueUseCase } from './list-execution-queue.use-case';
import { FailExecutionJobUseCase } from './fail-execution-job.use-case';
import { GetExecutionJobUseCase } from './get-execution-job.use-case';
import { StartDiagnosisUseCase } from './start-diagnosis.use-case';
import { StartRepairUseCase } from './start-repair.use-case';
import { Logger } from '@nestjs/common';

const MECHANIC = 'mechanic-1';

const command = (
  type: string,
  payload: Record<string, unknown>,
): SagaEnvelope => ({
  messageId: 'message-1',
  sagaId: 'saga-1',
  orderId: 'order-1',
  type,
  version: 1,
  occurredAt: '2026-11-17T10:00:00.000Z',
  payload,
});

const enqueueCommand = (overrides: Record<string, unknown> = {}) =>
  command('execution.job.enqueue', {
    orderNumber: 'OS-2026-000123',
    vehiclePlate: 'ABC1D23',
    priority: 'NORMAL',
    services: [{ name: 'Troca de óleo', quantity: 1 }],
    parts: [{ name: 'Filtro de óleo', quantity: 1 }],
    ...overrides,
  });

const newJob = () =>
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

const eventTypes = (messages: OutgoingMessage[]) =>
  messages.map((message) => message.routingKey);

describe('Execution job use cases', () => {
  let jobs: jest.Mocked<IExecutionJobRepository>;
  const logger = {
    log: jest.fn(),
    warn: jest.fn(),
  } as unknown as Logger;

  beforeEach(() => {
    jobs = {
      create: jest.fn().mockResolvedValue(true),
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn().mockResolvedValue(null),
      findByOrderId: jest.fn().mockResolvedValue(null),
      findActive: jest.fn().mockResolvedValue([]),
    };
  });

  const savedEvents = () => eventTypes(jobs.save.mock.calls[0][1]);

  describe('EnqueueExecutionJobUseCase', () => {
    const useCase = () => new EnqueueExecutionJobUseCase(jobs, logger);

    it('creates the job with the queued event', async () => {
      await useCase().execute(enqueueCommand());

      const [job, events] = jobs.create.mock.calls[0];
      expect(job).toMatchObject({
        orderId: 'order-1',
        sagaId: 'saga-1',
        status: ExecutionJobStatus.QUEUED,
      });
      expect(job.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(eventTypes(events)).toEqual(['execution.job.queued']);
      expect(events[0].envelope.payload).toEqual({
        jobId: job.id,
        queuedAt: job.createdAt.toISOString(),
      });
    });

    it('ignores a repeated command for the same order', async () => {
      jobs.create.mockResolvedValue(false);

      await expect(
        useCase().execute(enqueueCommand()),
      ).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('already in the execution queue'),
      );
    });

    it('sends an invalid payload to the dead letter queue', async () => {
      await expect(
        useCase().execute(enqueueCommand({ orderNumber: undefined })),
      ).rejects.toThrow(InvalidMessageException);
    });

    it('sends an order without items to the dead letter queue', async () => {
      await expect(
        useCase().execute(enqueueCommand({ services: [], parts: [] })),
      ).rejects.toThrow(InvalidMessageException);
      expect(jobs.create).not.toHaveBeenCalled();
    });

    it('lets infrastructure errors go to retry', async () => {
      jobs.create.mockRejectedValue(new Error('mongo down'));

      await expect(useCase().execute(enqueueCommand())).rejects.toThrow(
        'mongo down',
      );
    });
  });

  describe('CancelExecutionJobUseCase', () => {
    const useCase = () => new CancelExecutionJobUseCase(jobs, logger);
    const cancelCommand = (reason?: string) =>
      command('execution.job.cancel', reason ? { reason } : {});

    it('cancels an active job and confirms', async () => {
      jobs.findByOrderId.mockResolvedValue(newJob());

      await useCase().execute(cancelCommand('MANUAL_CANCEL'));

      const [job] = jobs.save.mock.calls[0];
      expect(job.status).toBe(ExecutionJobStatus.CANCELED);
      expect(job.timeline[job.timeline.length - 1].note).toBe('MANUAL_CANCEL');
      expect(savedEvents()).toEqual(['execution.job.canceled']);
    });

    it('confirms again without changing a job that already ended', async () => {
      const done = newJob();
      done.startDiagnosis(MECHANIC);
      done.startRepair(MECHANIC);
      done.finish(MECHANIC);
      jobs.findByOrderId.mockResolvedValue(done);

      await useCase().execute(cancelCommand());

      expect(jobs.save.mock.calls[0][0].status).toBe(ExecutionJobStatus.DONE);
      expect(savedEvents()).toEqual(['execution.job.canceled']);
    });

    it('retries while the job does not exist yet', async () => {
      await expect(useCase().execute(cancelCommand())).rejects.toThrow(
        NotFoundException,
      );
      expect(jobs.save).not.toHaveBeenCalled();
    });
  });

  describe('mechanic actions', () => {
    let job: ExecutionJobEntity;

    beforeEach(() => {
      job = newJob();
      jobs.findById.mockResolvedValue(job);
    });

    it('lists the active queue', async () => {
      jobs.findActive.mockResolvedValue([job]);

      const queue = await new ListExecutionQueueUseCase(jobs, logger).execute();

      expect(jobs.findActive).toHaveBeenCalledWith(100);
      expect(queue.map((item) => item.id)).toEqual(['job-1']);
    });

    it('returns a job with its timeline', async () => {
      const response = await new GetExecutionJobUseCase(jobs, logger).execute(
        'job-1',
      );

      expect(response).toMatchObject({
        id: 'job-1',
        orderNumber: 'OS-2026-000123',
        status: ExecutionJobStatus.QUEUED,
        timeline: [{ status: ExecutionJobStatus.QUEUED, by: 'system' }],
      });
    });

    it('answers 404 for an unknown job', async () => {
      jobs.findById.mockResolvedValue(null);

      await expect(
        new GetExecutionJobUseCase(jobs, logger).execute('missing'),
      ).rejects.toThrow(NotFoundException);
    });

    it('starts the diagnosis and publishes started', async () => {
      const response = await new StartDiagnosisUseCase(jobs, logger).execute(
        'job-1',
        MECHANIC,
      );

      expect(response.status).toBe(ExecutionJobStatus.DIAGNOSING);
      expect(response.mechanicId).toBe(MECHANIC);
      expect(savedEvents()).toEqual(['execution.job.started']);
    });

    it('starts the repair without publishing anything', async () => {
      job.startDiagnosis(MECHANIC);

      const response = await new StartRepairUseCase(jobs, logger).execute(
        'job-1',
        MECHANIC,
        'Junta vazando',
      );

      expect(response.status).toBe(ExecutionJobStatus.REPAIRING);
      expect(response.diagnosisNotes).toBe('Junta vazando');
      expect(savedEvents()).toEqual([]);
    });

    it('finishes the job and publishes completed', async () => {
      job.startDiagnosis(MECHANIC);
      job.startRepair(MECHANIC);

      const response = await new FinishExecutionJobUseCase(
        jobs,
        logger,
      ).execute('job-1', MECHANIC, 'Teste de rodagem ok');

      expect(response.status).toBe(ExecutionJobStatus.DONE);
      expect(response.durationSeconds).toEqual(expect.any(Number));
      expect(savedEvents()).toEqual(['execution.job.completed']);
    });

    it('records a failure and publishes failed', async () => {
      const response = await new FailExecutionJobUseCase(jobs, logger).execute(
        'job-1',
        MECHANIC,
        ExecutionFailureReason.PART_UNAVAILABLE,
        'Sem filtro no fornecedor',
      );

      expect(response).toMatchObject({
        status: ExecutionJobStatus.FAILED,
        failureReason: ExecutionFailureReason.PART_UNAVAILABLE,
        failureDetail: 'Sem filtro no fornecedor',
      });
      expect(savedEvents()).toEqual(['execution.job.failed']);
    });

    it('refuses an action out of order and saves nothing', async () => {
      await expect(
        new FinishExecutionJobUseCase(jobs, logger).execute('job-1', MECHANIC),
      ).rejects.toThrow(InvalidStatusTransitionException);
      expect(jobs.save).not.toHaveBeenCalled();
    });
  });
});
