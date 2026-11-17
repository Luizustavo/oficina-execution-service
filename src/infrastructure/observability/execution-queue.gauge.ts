import { IExecutionJobRepository } from '@domain/repositories/execution-job.repository.interface';
import { ACTIVE_STATUSES } from '@domain/entities/execution-job/execution-job.entity';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { metrics } from '@opentelemetry/api';

/** Tamanho da fila por status, lido do MongoDB a cada exportação de métricas. */
@Injectable()
export class ExecutionQueueGauge implements OnModuleInit {
  private readonly logger = new Logger(ExecutionQueueGauge.name);

  constructor(private readonly jobs: IExecutionJobRepository) {}

  onModuleInit(): void {
    metrics
      .getMeter('oficina-execution-service')
      .createObservableGauge('execution.queue.size', {
        description: 'Jobs em andamento, por status',
        unit: '{job}',
      })
      .addCallback(async (result) => {
        try {
          const counts = await this.jobs.countActiveByStatus();
          for (const status of ACTIVE_STATUSES) {
            result.observe(counts[status] ?? 0, { status });
          }
        } catch (error) {
          this.logger.warn(
            `Could not read the execution queue size: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      });
  }
}
