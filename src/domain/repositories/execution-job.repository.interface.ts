import { ExecutionJobEntity } from '@domain/entities/execution-job/execution-job.entity';
import { OutgoingMessage } from '@domain/messaging/saga-message';

export abstract class IExecutionJobRepository {
  /** Grava o job e os eventos numa escrita só. Devolve `false` se a OS já tem job. */
  abstract create(
    job: ExecutionJobEntity,
    events: OutgoingMessage[],
  ): Promise<boolean>;

  /** Lança `ConcurrentModificationException` se o job mudou desde a leitura. */
  abstract save(
    job: ExecutionJobEntity,
    events: OutgoingMessage[],
  ): Promise<void>;

  abstract findById(id: string): Promise<ExecutionJobEntity | null>;

  abstract findByOrderId(orderId: string): Promise<ExecutionJobEntity | null>;
}
