import {
  EXECUTION_JOB_MODEL,
  ExecutionJobRecord,
  PendingEventRecord,
} from '@infrastructure/database/mongo/schemas/execution-job.schema';
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { IMessagePublisher } from '@domain/services/message-publisher.interface';
import { rabbitmqConfig } from '@infrastructure/config/rabbitmq.config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { suppressTracing } from '@opentelemetry/core';
import { context } from '@opentelemetry/api';

type JobWithEvents = Pick<ExecutionJobRecord, '_id' | 'pendingEvents'>;

const LEASE_MS = 30_000;

/**
 * Publica o outbox embutido nos jobs (ADR-012). A concessão (`relayLeaseUntil`)
 * impede que duas réplicas publiquem os eventos do mesmo job ao mesmo tempo.
 */
@Injectable()
export class OutboxRelayService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(OutboxRelayService.name);
  private readonly config = rabbitmqConfig().rabbitmq;
  private running = false;
  private lastFailure?: string;
  private timer?: NodeJS.Timeout;

  constructor(
    @InjectModel(EXECUTION_JOB_MODEL)
    private readonly model: Model<ExecutionJobRecord>,
    private readonly publisher: IMessagePublisher,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.enabled) return;
    this.timer = setInterval(
      () => void this.tick(),
      this.config.relayIntervalMs,
    );
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      // A rodada consulta o banco a cada segundo: sem isto, cada uma vira um trace vazio.
      await context.with(suppressTracing(context.active()), () =>
        this.publishPending(),
      );
    } catch (error) {
      this.logger.error(`Outbox relay round failed: ${describe(error)}`);
    } finally {
      this.running = false;
    }
  }

  async publishPending(): Promise<number> {
    let total = 0;
    for (let claimed = 0; claimed < this.config.relayBatchSize; claimed++) {
      const job = await this.claimNextJob();
      if (!job) break;

      const published = await this.publishInOrder(job);
      await this.model.updateOne(
        { _id: job._id },
        {
          $pull: { pendingEvents: { messageId: { $in: published } } },
          $set: { relayLeaseUntil: null },
        },
      );
      total += published.length;
      if (published.length < job.pendingEvents.length) break;
    }

    if (total > 0) {
      this.lastFailure = undefined;
      this.logger.log(`Outbox relay published ${total} message(s)`);
    }
    return total;
  }

  private claimNextJob(): Promise<JobWithEvents | null> {
    const now = new Date();
    return this.model
      .findOneAndUpdate(
        {
          'pendingEvents.0': { $exists: true },
          relayLeaseUntil: { $not: { $gt: now } },
        },
        { $set: { relayLeaseUntil: new Date(now.getTime() + LEASE_MS) } },
        { returnDocument: 'after', projection: { pendingEvents: 1 } },
      )
      .lean<JobWithEvents>();
  }

  private async publishInOrder(job: JobWithEvents): Promise<string[]> {
    const published: string[] = [];
    for (const event of job.pendingEvents) {
      try {
        await this.publisher.publish(
          {
            exchange: event.exchange,
            routingKey: event.routingKey,
            envelope: event.envelope,
          },
          { traceparent: event.traceparent, tracestate: event.tracestate },
        );
        published.push(event.messageId);
      } catch (error) {
        this.warnOnce(event, error);
        break;
      }
    }
    return published;
  }

  private warnOnce(event: PendingEventRecord, error: unknown): void {
    const failure = `${event.messageId}:${describe(error)}`;
    if (failure === this.lastFailure) return;
    this.lastFailure = failure;
    this.logger.warn(
      `Could not publish outbox message ${event.messageId} (${event.routingKey}), will retry: ${describe(error)}`,
    );
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
