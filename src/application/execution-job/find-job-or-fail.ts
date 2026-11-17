import { IExecutionJobRepository } from '@domain/repositories/execution-job.repository.interface';
import { ExecutionJobEntity } from '@domain/entities/execution-job/execution-job.entity';
import { NotFoundException } from '@shared/exceptions/domain.exceptions';
import { Logger } from '@nestjs/common';

export async function findJobOrFail(
  jobs: IExecutionJobRepository,
  id: string,
  logger: Logger,
): Promise<ExecutionJobEntity> {
  const job = await jobs.findById(id);
  if (!job) {
    logger.warn(`Execution job ${id} not found`);
    throw new NotFoundException('ExecutionJob', id);
  }
  return job;
}
