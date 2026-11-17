import { EnqueueExecutionJobUseCase } from '@application/use-cases/execution-job/enqueue-execution-job.use-case';
import { CancelExecutionJobUseCase } from '@application/use-cases/execution-job/cancel-execution-job.use-case';
import { ExecutionCommand } from '@application/execution-job/execution-commands';
import { SagaMessageHandlerRegistry } from './saga-message-handler.registry';
import { Injectable, OnModuleInit } from '@nestjs/common';

@Injectable()
export class ExecutionCommandHandlers implements OnModuleInit {
  constructor(
    private readonly registry: SagaMessageHandlerRegistry,
    private readonly enqueueJob: EnqueueExecutionJobUseCase,
    private readonly cancelJob: CancelExecutionJobUseCase,
  ) {}

  onModuleInit(): void {
    this.registry.register({
      type: ExecutionCommand.ENQUEUE,
      versions: [1],
      handle: (command) => this.enqueueJob.execute(command),
    });
    this.registry.register({
      type: ExecutionCommand.CANCEL,
      versions: [1],
      handle: (command) => this.cancelJob.execute(command),
    });
  }
}
