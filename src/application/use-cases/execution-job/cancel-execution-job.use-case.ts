import { IExecutionJobRepository } from '@domain/repositories/execution-job.repository.interface';
import { ExecutionJobEvents } from '@application/execution-job/execution-job-events';
import { NotFoundException } from '@shared/exceptions/domain.exceptions';
import { SagaEnvelope } from '@domain/messaging/saga-message';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class CancelExecutionJobUseCase {
  constructor(
    private readonly jobs: IExecutionJobRepository,
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

    if (!job.cancel(reason)) {
      this.logger.warn(
        `Execution job ${job.id} is already ${job.status}; confirming the cancellation anyway`,
      );
    }
    await this.jobs.save(job, [ExecutionJobEvents.canceled(command, job)]);
    this.logger.log(`Execution job ${job.id} is ${job.status}`);
  }
}
