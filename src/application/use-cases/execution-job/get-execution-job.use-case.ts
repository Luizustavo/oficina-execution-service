import { IExecutionJobRepository } from '@domain/repositories/execution-job.repository.interface';
import { ExecutionJobResponseDto } from '@application/dtos/response/execution-job.dto';
import { findJobOrFail } from '@application/execution-job/find-job-or-fail';
import { ExecutionJobMapper } from '@application/mappers/execution-job.mapper';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class GetExecutionJobUseCase {
  constructor(
    private readonly jobs: IExecutionJobRepository,
    private readonly logger: Logger,
  ) {}

  async execute(id: string): Promise<ExecutionJobResponseDto> {
    this.logger.log(`Fetching execution job ${id}`);
    const job = await findJobOrFail(this.jobs, id, this.logger);
    this.logger.log(`Execution job ${id} found (${job.status})`);
    const response: ExecutionJobResponseDto =
      ExecutionJobMapper.toResponse(job);
    return response;
  }
}
