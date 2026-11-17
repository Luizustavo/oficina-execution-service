import { SagaEnvelope } from '@domain/messaging/saga-message';
import { Injectable } from '@nestjs/common';

export interface SagaMessageHandler {
  readonly type: string;
  readonly versions: number[];
  handle(envelope: SagaEnvelope): Promise<void>;
}

@Injectable()
export class SagaMessageHandlerRegistry {
  private readonly handlers = new Map<string, SagaMessageHandler>();

  register(handler: SagaMessageHandler): void {
    if (this.handlers.has(handler.type)) {
      throw new Error(`A handler for ${handler.type} is already registered`);
    }
    this.handlers.set(handler.type, handler);
  }

  find(type: string, version: number): SagaMessageHandler | undefined {
    const handler = this.handlers.get(type);
    return handler?.versions.includes(version) ? handler : undefined;
  }
}
