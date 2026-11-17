import {
  deadLetterQueueName,
  retryQueueName,
  RETRY_DELAYS_MS,
} from '@domain/messaging/retry-policy';
import { SagaExchange } from '@domain/messaging/saga-message';

import type { Channel } from 'amqplib';

export const EXECUTION_COMMANDS_QUEUE = 'execution.commands';

export async function assertExchanges(channel: Channel): Promise<void> {
  await channel.assertExchange(SagaExchange.COMMANDS, 'topic', {
    durable: true,
  });
  await channel.assertExchange(SagaExchange.EVENTS, 'topic', {
    durable: true,
  });
  await channel.assertExchange(SagaExchange.DEAD_LETTER, 'direct', {
    durable: true,
  });
}

// Argumentos idênticos nos três serviços: qualquer diferença derruba o canal (PRECONDITION_FAILED).
export async function assertConsumerQueue(
  channel: Channel,
  queue: string,
  exchange: string,
  bindingKeys: string[],
): Promise<void> {
  await channel.assertQueue(queue, {
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-dead-letter-exchange': SagaExchange.DEAD_LETTER,
      'x-dead-letter-routing-key': queue,
    },
  });
  await Promise.all(
    bindingKeys.map((key) => channel.bindQueue(queue, exchange, key)),
  );

  await Promise.all(
    RETRY_DELAYS_MS.map((ttl, index) =>
      channel.assertQueue(retryQueueName(queue, index + 1), {
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-message-ttl': ttl,
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': queue,
        },
      }),
    ),
  );

  const dlq = deadLetterQueueName(queue);
  await channel.assertQueue(dlq, {
    durable: true,
    arguments: { 'x-queue-type': 'quorum' },
  });
  await channel.bindQueue(dlq, SagaExchange.DEAD_LETTER, queue);
}

export async function assertExecutionTopology(channel: Channel): Promise<void> {
  await assertExchanges(channel);
  await assertConsumerQueue(
    channel,
    EXECUTION_COMMANDS_QUEUE,
    SagaExchange.COMMANDS,
    ['execution.#'],
  );
}
