import { OutgoingMessage } from '@domain/messaging/saga-message';

export abstract class IMessagePublisher {
  abstract publish(
    message: OutgoingMessage,
    trace?: { traceparent?: string; tracestate?: string },
  ): Promise<void>;
}
