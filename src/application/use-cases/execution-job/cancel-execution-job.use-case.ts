import { IExecutionJobRepository } from '@domain/repositories/execution-job.repository.interface';
import { ExecutionJobEvents } from '@application/execution-job/execution-job-events';
import { NotFoundException } from '@shared/exceptions/domain.exceptions';
import { SagaEnvelope } from '@domain/messaging/saga-message';
import { ExecutionMetrics } from '@infrastructure/observability/execution.metrics';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class CancelExecutionJobUseCase {
  constructor(
    private readonly jobs: IExecutionJobRepository,
    private readonly metrics: ExecutionMetrics,
    private readonly logger: Logger,
  ) {}

  async execute(command: SagaEnvelope): Promise<void> {
    const reason =
      typeof command.payload.reason === 'string'
        ? command.payload.reason
        : 'UNSPECIFIED';
    this.logger.log(
      `Canceling execution of order ${command.orderId} (saga ${command.sagaId}): ${reason}`,
    );

    const job = await this.jobs.findByOrderId(command.orderId);
    if (!job) {
      // O enqueue pode estar em retentativa: tentar de novo dá tempo de o job existir.
      this.logger.warn(`No execution job for order ${command.orderId} yet`);
      throw new NotFoundException('ExecutionJob for order', command.orderId);
    }

    const canceled = job.cancel(reason);
    if (!canceled) {
      this.logger.warn(
        `Execution job ${job.id} is already ${job.status}; confirming the cancellation anyway`,
      );
    }
    await this.jobs.save(job, [ExecutionJobEvents.canceled(command, job)]);
    if (canceled) {
      this.metrics.recordFinished(job.status);
    }
    this.logger.log(`Execution job ${job.id} is ${job.status}`);
  }
}
