import {
  AmqpConnectionManager,
  ChannelWrapper,
  CreateChannelOpts,
  connect,
} from 'amqp-connection-manager';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { rabbitmqConfig } from '@infrastructure/config/rabbitmq.config';

@Injectable()
export class RabbitMqConnection implements OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqConnection.name);
  private readonly config = rabbitmqConfig().rabbitmq;
  private manager?: AmqpConnectionManager;
  private failedAttempts = 0;

  get enabled(): boolean {
    return this.config.enabled;
  }

  createChannel(options: CreateChannelOpts): ChannelWrapper {
    return this.getManager().createChannel(options);
  }

  private getManager(): AmqpConnectionManager {
    if (!this.config.enabled) {
      throw new Error('Messaging is disabled: RABBITMQ_URL is not set');
    }
    if (!this.manager) {
      this.manager = connect([this.config.url], {
        heartbeatIntervalInSeconds: 30,
        reconnectTimeInSeconds: 5,
        connectionOptions: { timeout: this.config.connectTimeoutMs },
      });
      const target = redact(this.config.url);
      this.manager.on('connect', () => {
        this.failedAttempts = 0;
        this.logger.log(`Connected to RabbitMQ at ${target}`);
      });
      this.manager.on('disconnect', ({ err }) =>
        this.logger.warn(
          `Disconnected from RabbitMQ at ${target}: ${err?.message ?? 'unknown reason'}. Reconnecting...`,
        ),
      );
      this.manager.on('connectFailed', ({ err }) => {
        this.failedAttempts++;
        if (this.failedAttempts === 1 || this.failedAttempts % 12 === 0) {
          this.logger.warn(
            `Could not connect to RabbitMQ at ${target} (attempt ${this.failedAttempts}): ${err?.message ?? 'unknown reason'}`,
          );
        }
      });
    }
    return this.manager;
  }

  async onModuleDestroy(): Promise<void> {
    await this.manager?.close();
  }
}

function redact(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return '(invalid RABBITMQ_URL)';
  }
}
