import { IExecutionJobRepository } from '@domain/repositories/execution-job.repository.interface';
import { ExecutionJobResponseDto } from '@application/dtos/response/execution-job.dto';
import { ExecutionJobEvents } from '@application/execution-job/execution-job-events';
import { findJobOrFail } from '@application/execution-job/find-job-or-fail';
import { ExecutionJobMapper } from '@application/mappers/execution-job.mapper';
import { ExecutionFailureReason } from '@domain/enums/execution-job.enum';
import { ExecutionMetrics } from '@infrastructure/observability/execution.metrics';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class FailExecutionJobUseCase {
  constructor(
    private readonly jobs: IExecutionJobRepository,
    private readonly metrics: ExecutionMetrics,
    private readonly logger: Logger,
  ) {}

  async execute(
    id: string,
    mechanicId: string,
    reason: ExecutionFailureReason,
    detail: string,
  ): Promise<ExecutionJobResponseDto> {
    this.logger.log(
      `Mechanic ${mechanicId} reporting failure of job ${id}: ${reason}`,
    );
    const job = await findJobOrFail(this.jobs, id, this.logger);

    job.fail(mechanicId, reason, detail);
    await this.jobs.save(job, [ExecutionJobEvents.failed(job)]);
    this.metrics.recordFinished(job.status);

    this.logger.log(
      `Execution job ${id} failed (${reason}); the saga will compensate`,
    );
    const response: ExecutionJobResponseDto =
      ExecutionJobMapper.toResponse(job);
    return response;
  }
}
