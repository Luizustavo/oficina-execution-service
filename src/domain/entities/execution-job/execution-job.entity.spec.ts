import {
  ExecutionFailureReason,
  ExecutionJobStatus,
  ExecutionPriority,
} from '@domain/enums/execution-job.enum';
import {
  InvalidStatusTransitionException,
  BusinessRuleException,
} from '@shared/exceptions/domain.exceptions';
import {
  CreateExecutionJobProps,
  ExecutionJobEntity,
  SYSTEM_ACTOR,
} from './execution-job.entity';

const MECHANIC = 'mechanic-1';

const validProps = (
  overrides: Partial<CreateExecutionJobProps> = {},
): CreateExecutionJobProps => ({
  orderId: 'order-1',
  sagaId: 'saga-1',
  orderNumber: 'OS-2026-000123',
  vehiclePlate: 'ABC1D23',
  priority: ExecutionPriority.NORMAL,
  services: [{ name: 'Troca de óleo', quantity: 1 }],
  parts: [{ name: 'Filtro de óleo', quantity: 1 }],
  ...overrides,
});

const queuedJob = () => ExecutionJobEntity.create(validProps(), 'job-1');

const repairingJob = () => {
  const job = queuedJob();
  job.startDiagnosis(MECHANIC);
  job.startRepair(MECHANIC, 'Junta do cárter vazando');
  return job;
};

const lastEntry = (job: ExecutionJobEntity) =>
  job.timeline[job.timeline.length - 1];

describe('ExecutionJobEntity', () => {
  describe('create', () => {
    it('enters the queue with a system timeline entry', () => {
      const job = queuedJob();

      expect(job.id).toBe('job-1');
      expect(job.status).toBe(ExecutionJobStatus.QUEUED);
      expect(job.timeline).toEqual([
        {
          status: ExecutionJobStatus.QUEUED,
          at: job.createdAt,
          by: SYSTEM_ACTOR,
        },
      ]);
      expect(job.mechanicId).toBeUndefined();
      expect(job.startedAt).toBeUndefined();
      expect(job.durationSeconds).toBeUndefined();
    });

    it('accepts an order with services only', () => {
      const job = ExecutionJobEntity.create(validProps({ parts: [] }));

      expect(job.parts).toEqual([]);
      expect(job.id).toBe('');
    });

    it.each([
      ['orderId', { orderId: ' ' }],
      ['sagaId', { sagaId: '' }],
      ['orderNumber', { orderNumber: '' }],
      ['vehiclePlate', { vehiclePlate: undefined as unknown as string }],
    ])('rejects a missing %s', (_field, overrides) => {
      expect(() => ExecutionJobEntity.create(validProps(overrides))).toThrow(
        BusinessRuleException,
      );
    });

    it('rejects an unknown priority', () => {
      expect(() =>
        ExecutionJobEntity.create(
          validProps({ priority: 'URGENT' as ExecutionPriority }),
        ),
      ).toThrow('Invalid priority "URGENT"');
    });

    it('rejects a job without items', () => {
      expect(() =>
        ExecutionJobEntity.create(validProps({ services: [], parts: [] })),
      ).toThrow('at least one service or part');
    });

    it.each([
      [{ name: '', quantity: 1 }],
      [{ name: 'Filtro', quantity: 0 }],
      [{ name: 'Filtro', quantity: 1.5 }],
    ])('rejects an invalid item %o', (item) => {
      expect(() =>
        ExecutionJobEntity.create(validProps({ parts: [item] })),
      ).toThrow('positive integer quantity');
    });
  });

  describe('happy path', () => {
    it('goes QUEUED → DIAGNOSING → REPAIRING → DONE recording each step', () => {
      const job = repairingJob();
      job.finish(MECHANIC, 'Teste de rodagem ok');

      expect(job.status).toBe(ExecutionJobStatus.DONE);
      expect(job.mechanicId).toBe(MECHANIC);
      expect(job.diagnosisNotes).toBe('Junta do cárter vazando');
      expect(job.timeline.map((entry) => entry.status)).toEqual([
        ExecutionJobStatus.QUEUED,
        ExecutionJobStatus.DIAGNOSING,
        ExecutionJobStatus.REPAIRING,
        ExecutionJobStatus.DONE,
      ]);
      expect(job.timeline[3]).toMatchObject({
        by: MECHANIC,
        note: 'Teste de rodagem ok',
      });
      expect(job.timeline[1]).not.toHaveProperty('note');
    });

    it('keeps the diagnosis notes when repair starts without new notes', () => {
      const job = queuedJob();
      job.startDiagnosis(MECHANIC);
      job.startRepair(MECHANIC);

      expect(job.diagnosisNotes).toBeUndefined();
      expect(job.status).toBe(ExecutionJobStatus.REPAIRING);
    });

    it('measures the duration from the start of diagnosis to the end', () => {
      jest.useFakeTimers({ now: new Date('2026-11-16T10:00:00Z') });
      const job = queuedJob();
      jest.setSystemTime(new Date('2026-11-16T10:05:00Z'));
      job.startDiagnosis(MECHANIC);
      job.startRepair(MECHANIC);
      jest.setSystemTime(new Date('2026-11-16T11:35:00Z'));
      job.finish(MECHANIC);
      jest.useRealTimers();

      expect(job.startedAt).toEqual(new Date('2026-11-16T10:05:00Z'));
      expect(job.completedAt).toEqual(new Date('2026-11-16T11:35:00Z'));
      expect(job.durationSeconds).toBe(5400);
      expect(job.updatedAt).toEqual(job.completedAt);
    });
  });

  describe('invalid transitions', () => {
    it('cannot repair before diagnosing', () => {
      expect(() => queuedJob().startRepair(MECHANIC)).toThrow(
        InvalidStatusTransitionException,
      );
    });

    it('cannot finish before repairing', () => {
      const job = queuedJob();
      job.startDiagnosis(MECHANIC);

      expect(() => job.finish(MECHANIC)).toThrow(
        'Invalid status transition from DIAGNOSING to DONE',
      );
    });

    it('cannot start diagnosis twice', () => {
      const job = queuedJob();
      job.startDiagnosis(MECHANIC);

      expect(() => job.startDiagnosis('other')).toThrow(
        InvalidStatusTransitionException,
      );
      expect(job.mechanicId).toBe(MECHANIC);
    });
  });

  describe('fail', () => {
    it.each([
      ['QUEUED', queuedJob],
      ['REPAIRING', repairingJob],
    ])('can fail a %s job', (_status, build) => {
      const job = build();
      job.fail(MECHANIC, ExecutionFailureReason.PART_UNAVAILABLE, 'Sem filtro');

      expect(job.status).toBe(ExecutionJobStatus.FAILED);
      expect(job.failureReason).toBe(ExecutionFailureReason.PART_UNAVAILABLE);
      expect(job.failureDetail).toBe('Sem filtro');
      expect(lastEntry(job)).toMatchObject({
        by: MECHANIC,
        note: 'Sem filtro',
      });
    });

    it('cannot fail a finished job', () => {
      const job = repairingJob();
      job.finish(MECHANIC);

      expect(() =>
        job.fail(MECHANIC, ExecutionFailureReason.OTHER, 'tarde demais'),
      ).toThrow(InvalidStatusTransitionException);
    });
  });

  describe('cancel', () => {
    it('cancels an active job once', () => {
      const job = repairingJob();

      expect(job.cancel('MANUAL_CANCEL')).toBe(true);
      expect(job.cancel('MANUAL_CANCEL')).toBe(false);
      expect(job.status).toBe(ExecutionJobStatus.CANCELED);
      expect(lastEntry(job)).toMatchObject({
        status: ExecutionJobStatus.CANCELED,
        by: SYSTEM_ACTOR,
        note: 'MANUAL_CANCEL',
      });
    });

    it('leaves a finished job untouched', () => {
      const job = repairingJob();
      job.finish(MECHANIC);

      expect(job.cancel('MANUAL_CANCEL')).toBe(false);
      expect(job.status).toBe(ExecutionJobStatus.DONE);
    });
  });

  it('reconstitutes every field as stored', () => {
    const job = repairingJob();
    job.fail(MECHANIC, ExecutionFailureReason.TECHNICAL_ISSUE, 'Motor travado');

    const copy = ExecutionJobEntity.reconstitute(
      {
        orderId: job.orderId,
        sagaId: job.sagaId,
        orderNumber: job.orderNumber,
        vehiclePlate: job.vehiclePlate,
        status: job.status,
        priority: job.priority,
        services: job.services,
        parts: job.parts,
        mechanicId: job.mechanicId,
        diagnosisNotes: job.diagnosisNotes,
        failureReason: job.failureReason,
        failureDetail: job.failureDetail,
        timeline: job.timeline,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      },
      job.id,
    );

    expect(copy).toEqual(job);
  });
});
