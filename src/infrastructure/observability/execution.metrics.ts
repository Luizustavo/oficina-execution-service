import { ExecutionJobStatus } from '@domain/enums/execution-job.enum';
import { Injectable } from '@nestjs/common';
import { metrics } from '@opentelemetry/api';

@Injectable()
export class ExecutionMetrics {
  private readonly meter = metrics.getMeter('oficina-execution-service');

  private readonly finished = this.meter.createCounter(
    'execution.jobs.finished',
    {
      description: 'Jobs encerrados, por status final',
      unit: '{job}',
    },
  );

  private readonly duration = this.meter.createHistogram(
    'execution.job.duration',
    {
      description: 'Do início do diagnóstico à conclusão do reparo',
      unit: 's',
    },
  );

  recordFinished(status: ExecutionJobStatus, durationSeconds?: number): void {
    this.finished.add(1, { status });
    if (durationSeconds !== undefined) {
      this.duration.record(durationSeconds, { status });
    }
  }
}
