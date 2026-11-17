import { IMessagePublisher } from '@domain/services/message-publisher.interface';
import { ExecutionCommandsConsumer } from './execution-commands.consumer';
import { SagaMessageHandlerRegistry } from './saga-message-handler.registry';
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
    SagaMessageHandlerRegistry,
    OutboxRelayService,
    ExecutionCommandsConsumer,
  ],
  exports: [RabbitMqConnection, IMessagePublisher, SagaMessageHandlerRegistry],
})
export class MessagingModule {}
