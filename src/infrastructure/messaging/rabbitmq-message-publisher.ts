import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { IMessagePublisher } from '@domain/services/message-publisher.interface';
import { rabbitmqConfig } from '@infrastructure/config/rabbitmq.config';
import { OutgoingMessage } from '@domain/messaging/saga-message';
import { RabbitMqConnection } from './rabbitmq-connection.service';
import { ChannelWrapper } from 'amqp-connection-manager';
import { assertExecutionTopology } from './topology';
import { tracedPublish } from './message-tracing';

import type { ConfirmChannel, ConsumeMessage, Options } from 'amqplib';

export class UnroutableMessageError extends Error {
  constructor(exchange: string, routingKey: string) {
    super(`No queue bound to ${exchange} for routing key ${routingKey}`);
    this.name = 'UnroutableMessageError';
  }
}

export type RawPublishOptions = Options.Publish & { messageId: string };

@Injectable()
export class RabbitMqMessagePublisher
  implements IMessagePublisher, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RabbitMqMessagePublisher.name);
  private readonly config = rabbitmqConfig().rabbitmq;
  private channel?: ChannelWrapper;
  private readonly returned = new Set<string>();

  constructor(private readonly connection: RabbitMqConnection) {}

  onModuleInit(): void {
    if (!this.connection.enabled) {
      this.logger.warn(
        'RABBITMQ_URL not set: messaging disabled, outbox messages will wait in the database',
      );
      return;
    }
    this.channel = this.connection.createChannel({
      name: 'execution-publisher',
      confirm: true,
      json: false,
      publishTimeout: this.config.publishTimeoutMs,
      setup: async (channel: ConfirmChannel) => {
        await assertExecutionTopology(channel);
        channel.on('return', (msg: ConsumeMessage) => {
          const id = msg.properties.messageId as string | undefined;
          if (id) this.returned.add(id);
        });
      },
    });
  }

  async publish(
    message: OutgoingMessage,
    trace: { traceparent?: string; tracestate?: string } = {},
  ): Promise<void> {
    const { envelope } = message;
    await tracedPublish(message, trace, (headers) =>
      this.publishRaw(
        message.exchange,
        message.routingKey,
        Buffer.from(JSON.stringify(envelope)),
        {
          messageId: envelope.messageId,
          correlationId: envelope.sagaId,
          type: envelope.type,
          headers,
        },
      ),
    );
  }

  async publishRaw(
    exchange: string,
    routingKey: string,
    content: Buffer,
    options: RawPublishOptions,
  ): Promise<void> {
    if (!this.channel) {
      throw new Error('Messaging is disabled: RABBITMQ_URL is not set');
    }
    const id = options.messageId;
    this.returned.delete(id);
    await this.channel.publish(exchange, routingKey, content, {
      ...options,
      contentType: 'application/json',
      persistent: true,
      mandatory: true,
    });
    if (this.returned.delete(id)) {
      throw new UnroutableMessageError(exchange, routingKey);
    }
  }

  async whenReady(): Promise<void> {
    await this.channel?.waitForConnect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close();
  }
}
