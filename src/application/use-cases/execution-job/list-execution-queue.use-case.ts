import { IExecutionJobRepository } from '@domain/repositories/execution-job.repository.interface';
import { ExecutionJobResponseDto } from '@application/dtos/response/execution-job.dto';
import { ExecutionJobMapper } from '@application/mappers/execution-job.mapper';
import { Injectable, Logger } from '@nestjs/common';

const QUEUE_LIMIT = 100;

@Injectable()
export class ListExecutionQueueUseCase {
  constructor(
    private readonly jobs: IExecutionJobRepository,
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<ExecutionJobResponseDto[]> {
    this.logger.log('Listing the execution queue');
    const jobs = await this.jobs.findActive(QUEUE_LIMIT);
    this.logger.log(`Execution queue has ${jobs.length} active job(s)`);
    const response: ExecutionJobResponseDto[] = jobs.map((job) =>
      ExecutionJobMapper.toResponse(job),
    );
    return response;
  }
}
