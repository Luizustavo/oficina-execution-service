import {
  BusinessRuleException,
  InvalidMessageException,
} from '@shared/exceptions/domain.exceptions';
import { IExecutionJobRepository } from '@domain/repositories/execution-job.repository.interface';
import { ExecutionJobEntity } from '@domain/entities/execution-job/execution-job.entity';
import { ExecutionJobEvents } from '@application/execution-job/execution-job-events';
import { parseEnqueuePayload } from '@application/execution-job/enqueue-payload';
import { SagaEnvelope } from '@domain/messaging/saga-message';
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

@Injectable()
export class EnqueueExecutionJobUseCase {
  constructor(
    private readonly jobs: IExecutionJobRepository,
    private readonly logger: Logger,
  ) {}

  async execute(command: SagaEnvelope): Promise<void> {
    this.logger.log(
      `Enqueuing execution of order ${command.orderId} (saga ${command.sagaId})`,
    );

    const job = this.createJob(command);
    const created = await this.jobs.create(job, [
      ExecutionJobEvents.queued(job),
    ]);
    if (!created) {
      this.logger.warn(
        `Order ${command.orderId} is already in the execution queue; ignoring the repeated command`,
      );
      return;
    }
    this.logger.log(
      `Execution job ${job.id} queued for order ${command.orderId}`,
    );
  }

  private createJob(command: SagaEnvelope): ExecutionJobEntity {
    try {
      return ExecutionJobEntity.create(
        {
          orderId: command.orderId,
          sagaId: command.sagaId,
          ...parseEnqueuePayload(command.payload),
        },
        randomUUID(),
      );
    } catch (error) {
      if (error instanceof BusinessRuleException) {
        throw new InvalidMessageException(error.message);
      }
      throw error;
    }
  }
}
