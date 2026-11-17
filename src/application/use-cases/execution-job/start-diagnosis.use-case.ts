import { IExecutionJobRepository } from '@domain/repositories/execution-job.repository.interface';
import { ExecutionJobResponseDto } from '@application/dtos/response/execution-job.dto';
import { ExecutionJobEvents } from '@application/execution-job/execution-job-events';
import { findJobOrFail } from '@application/execution-job/find-job-or-fail';
import { ExecutionJobMapper } from '@application/mappers/execution-job.mapper';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class StartDiagnosisUseCase {
  constructor(
    private readonly jobs: IExecutionJobRepository,
    private readonly logger: Logger,
  ) {}

  async execute(
    id: string,
    mechanicId: string,
  ): Promise<ExecutionJobResponseDto> {
    this.logger.log(`Mechanic ${mechanicId} starting diagnosis of job ${id}`);
    const job = await findJobOrFail(this.jobs, id, this.logger);

    job.startDiagnosis(mechanicId);
    await this.jobs.save(job, [ExecutionJobEvents.started(job)]);

    this.logger.log(`Execution job ${id} is in diagnosis`);
    const response: ExecutionJobResponseDto =
      ExecutionJobMapper.toResponse(job);
    return response;
  }
}
