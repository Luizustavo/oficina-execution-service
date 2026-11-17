import { IMessagePublisher } from '@domain/services/message-publisher.interface';
import { RabbitMqMessagePublisher } from './rabbitmq-message-publisher';
import { RabbitMqConnection } from './rabbitmq-connection.service';
import { OutboxRelayService } from './outbox-relay.service';
import { Global, Module } from '@nestjs/common';

@Global()
@Module({
  providers: [
    RabbitMqConnection,
    RabbitMqMessagePublisher,
    { provide: IMessagePublisher, useExisting: RabbitMqMessagePublisher },
    OutboxRelayService,
  ],
  exports: [RabbitMqConnection, IMessagePublisher],
})
export class MessagingModule {}
