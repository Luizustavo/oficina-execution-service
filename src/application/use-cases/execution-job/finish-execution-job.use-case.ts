import { IExecutionJobRepository } from '@domain/repositories/execution-job.repository.interface';
import { ExecutionJobResponseDto } from '@application/dtos/response/execution-job.dto';
import { ExecutionJobEvents } from '@application/execution-job/execution-job-events';
import { findJobOrFail } from '@application/execution-job/find-job-or-fail';
import { ExecutionJobMapper } from '@application/mappers/execution-job.mapper';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class FinishExecutionJobUseCase {
  constructor(
    private readonly jobs: IExecutionJobRepository,
    private readonly logger: Logger,
  ) {}

  async execute(
    id: string,
    mechanicId: string,
    note?: string,
  ): Promise<ExecutionJobResponseDto> {
    this.logger.log(`Mechanic ${mechanicId} finishing job ${id}`);
    const job = await findJobOrFail(this.jobs, id, this.logger);

    job.finish(mechanicId, note);
    await this.jobs.save(job, [ExecutionJobEvents.completed(job)]);

    this.logger.log(`Execution job ${id} is done in ${job.durationSeconds}s`);
    const response: ExecutionJobResponseDto =
      ExecutionJobMapper.toResponse(job);
    return response;
  }
}
