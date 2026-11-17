import { EnqueueExecutionJobUseCase } from '@application/use-cases/execution-job/enqueue-execution-job.use-case';
import { CancelExecutionJobUseCase } from '@application/use-cases/execution-job/cancel-execution-job.use-case';
import { FinishExecutionJobUseCase } from '@application/use-cases/execution-job/finish-execution-job.use-case';
import { ListExecutionQueueUseCase } from '@application/use-cases/execution-job/list-execution-queue.use-case';
import { FailExecutionJobUseCase } from '@application/use-cases/execution-job/fail-execution-job.use-case';
import { GetExecutionJobUseCase } from '@application/use-cases/execution-job/get-execution-job.use-case';
import { StartDiagnosisUseCase } from '@application/use-cases/execution-job/start-diagnosis.use-case';
import { ExecutionJobsController } from '@infrastructure/presentation/controllers/execution-jobs.controller';
import { StartRepairUseCase } from '@application/use-cases/execution-job/start-repair.use-case';
import { ExecutionCommandHandlers } from '@infrastructure/messaging/execution-command-handlers';
import { ExecutionQueueGauge } from '@infrastructure/observability/execution-queue.gauge';
import { ExecutionMetrics } from '@infrastructure/observability/execution.metrics';
import { Logger, Module } from '@nestjs/common';

@Module({
  controllers: [ExecutionJobsController],
  providers: [
    Logger,
    ExecutionMetrics,
    ExecutionQueueGauge,
    EnqueueExecutionJobUseCase,
    CancelExecutionJobUseCase,
    ListExecutionQueueUseCase,
    GetExecutionJobUseCase,
    StartDiagnosisUseCase,
    StartRepairUseCase,
    FinishExecutionJobUseCase,
    FailExecutionJobUseCase,
    ExecutionCommandHandlers,
  ],
})
export class ExecutionModule {}
