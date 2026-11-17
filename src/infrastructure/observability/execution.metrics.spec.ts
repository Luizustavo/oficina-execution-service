import { ExecutionJobStatus } from '@domain/enums/execution-job.enum';
import { ExecutionQueueGauge } from './execution-queue.gauge';
import { ExecutionMetrics } from './execution.metrics';
import { metrics } from '@opentelemetry/api';

const add = jest.fn();
const record = jest.fn();
let callback: (result: { observe: jest.Mock }) => Promise<void>;

describe('Execution metrics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(metrics, 'getMeter').mockReturnValue({
      createCounter: () => ({ add }),
      createHistogram: () => ({ record }),
      createObservableGauge: () => ({
        addCallback: (fn: typeof callback) => (callback = fn),
      }),
    } as unknown as ReturnType<typeof metrics.getMeter>);
  });

  afterEach(() => jest.restoreAllMocks());

  it('counts a finished job and records the repair duration', () => {
    new ExecutionMetrics().recordFinished(ExecutionJobStatus.DONE, 5400);

    expect(add).toHaveBeenCalledWith(1, { status: 'DONE' });
    expect(record).toHaveBeenCalledWith(5400, { status: 'DONE' });
  });

  it('has no duration for a failed job', () => {
    new ExecutionMetrics().recordFinished(ExecutionJobStatus.FAILED);

    expect(add).toHaveBeenCalledWith(1, { status: 'FAILED' });
    expect(record).not.toHaveBeenCalled();
  });

  it('observes every active status, zero included', async () => {
    const jobs = {
      countActiveByStatus: jest.fn().mockResolvedValue({ QUEUED: 3 }),
    };
    new ExecutionQueueGauge(jobs as never).onModuleInit();
    const observe = jest.fn();

    await callback({ observe });

    expect(observe.mock.calls).toEqual([
      [3, { status: 'QUEUED' }],
      [0, { status: 'DIAGNOSING' }],
      [0, { status: 'REPAIRING' }],
    ]);
  });

  it('skips the reading when MongoDB is down', async () => {
    const jobs = {
      countActiveByStatus: jest.fn().mockRejectedValue(new Error('down')),
    };
    new ExecutionQueueGauge(jobs as never).onModuleInit();
    const observe = jest.fn();

    await expect(callback({ observe })).resolves.toBeUndefined();
    expect(observe).not.toHaveBeenCalled();
  });
});
