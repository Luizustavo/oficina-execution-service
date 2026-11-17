import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { InvalidMessageException } from '@shared/exceptions/domain.exceptions';
import { rabbitmqConfig } from '@infrastructure/config/rabbitmq.config';
import { SagaMessageHandlerRegistry } from './saga-message-handler.registry';
import { RabbitMqMessagePublisher } from './rabbitmq-message-publisher';
import {
  parseSagaEnvelope,
  SagaExchange,
} from '@domain/messaging/saga-message';
import { assertExecutionTopology, EXECUTION_COMMANDS_QUEUE } from './topology';
import { decideOnFailure } from '@domain/messaging/retry-policy';
import { RabbitMqConnection } from './rabbitmq-connection.service';
import { ChannelWrapper } from 'amqp-connection-manager';

import type { Channel, ConsumeMessage } from 'amqplib';

export type ConsumeOutcome =
  | 'processed'
  | 'retried'
  | 'dead-lettered'
  | 'rejected';

// Sem tabela de mensagens processadas (ADR-012): cada comando é idempotente pelo estado do job.
@Injectable()
export class ExecutionCommandsConsumer
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ExecutionCommandsConsumer.name);
  private readonly config = rabbitmqConfig().rabbitmq;
  private channel?: ChannelWrapper;

  constructor(
    private readonly connection: RabbitMqConnection,
    private readonly publisher: RabbitMqMessagePublisher,
    private readonly registry: SagaMessageHandlerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.connection.enabled) return;
    this.channel = this.connection.createChannel({
      name: 'execution-commands-consumer',
      setup: async (channel: Channel) => {
        await assertExecutionTopology(channel);
        await channel.prefetch(this.config.prefetch);
        await channel.consume(
          EXECUTION_COMMANDS_QUEUE,
          (msg) => {
            if (msg) void this.onMessage(channel, msg);
          },
          { noAck: false },
        );
      },
    });
  }

  async whenReady(): Promise<void> {
    await this.channel?.waitForConnect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close();
  }

  private async onMessage(
    channel: Channel,
    msg: ConsumeMessage,
  ): Promise<void> {
    try {
      const outcome = await this.handle(msg);
      if (outcome === 'rejected') {
        channel.nack(msg, false, false);
      } else {
        channel.ack(msg);
      }
    } catch (error) {
      this.logger.error(
        `Could not settle message ${String(msg.properties.messageId)}: ${describe(error)}`,
      );
      channel.nack(msg, false, true);
    }
  }

  async handle(msg: ConsumeMessage): Promise<ConsumeOutcome> {
    const body = msg.content.toString('utf8');
    let envelope;
    try {
      envelope = parseSagaEnvelope(body);
      if (!this.registry.find(envelope.type, envelope.version)) {
        throw new InvalidMessageException(
          `No handler for ${envelope.type} v${envelope.version}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Rejecting invalid message ${String(msg.properties.messageId)} from ${EXECUTION_COMMANDS_QUEUE}: ${describe(error)}`,
      );
      return 'rejected';
    }

    const handler = this.registry.find(envelope.type, envelope.version)!;
    const context = `${envelope.type} ${envelope.messageId} (saga ${envelope.sagaId}, order ${envelope.orderId})`;

    try {
      await handler.handle(envelope);
      this.logger.log(`Processed ${context}`);
      return 'processed';
    } catch (error) {
      return this.handleFailure(msg, context, error);
    }
  }

  private async handleFailure(
    msg: ConsumeMessage,
    context: string,
    error: unknown,
  ): Promise<ConsumeOutcome> {
    const headers = msg.properties.headers ?? {};
    const retryCount = Number(headers['x-retry-count'] ?? 0);
    const decision = decideOnFailure(
      EXECUTION_COMMANDS_QUEUE,
      retryCount,
      error,
    );

    if (decision.action === 'reject') {
      this.logger.warn(`Rejecting ${context}: ${describe(error)}`);
      return 'rejected';
    }

    const options = {
      ...msg.properties,
      messageId: String(msg.properties.messageId),
      headers: { ...headers },
    };

    if (decision.action === 'retry') {
      options.headers['x-retry-count'] = decision.attempt;
      await this.publisher.publishRaw(
        '',
        decision.retryQueue,
        msg.content,
        options,
      );
      this.logger.warn(
        `Failed ${context}, retry ${decision.attempt} via ${decision.retryQueue}: ${describe(error)}`,
      );
      return 'retried';
    }

    await this.publisher.publishRaw(
      SagaExchange.DEAD_LETTER,
      EXECUTION_COMMANDS_QUEUE,
      msg.content,
      options,
    );
    this.logger.error(
      `Failed ${context} after ${retryCount} retries, sent to dead letter queue: ${describe(error)}`,
    );
    return 'dead-lettered';
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
