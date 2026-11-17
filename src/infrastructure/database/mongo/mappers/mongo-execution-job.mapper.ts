import {
  ExecutionJobRecord,
  PendingEventRecord,
} from '@infrastructure/database/mongo/schemas/execution-job.schema';
import { ExecutionJobEntity } from '@domain/entities/execution-job/execution-job.entity';
import { ExecutionPriority } from '@domain/enums/execution-job.enum';
import { OutgoingMessage } from '@domain/messaging/saga-message';
import { context, propagation } from '@opentelemetry/api';

export type ExecutionJobState = Omit<
  ExecutionJobRecord,
  '_id' | 'pendingEvents' | 'relayLeaseUntil' | 'version'
>;

const PRIORITY_RANK: Record<ExecutionPriority, number> = {
  [ExecutionPriority.HIGH]: 0,
  [ExecutionPriority.NORMAL]: 1,
  [ExecutionPriority.LOW]: 2,
};

export class MongoExecutionJobMapper {
  private constructor() {
    throw new Error(
      'MongoExecutionJobMapper is a static class and cannot be instantiated.',
    );
  }

  public static toState(job: ExecutionJobEntity): ExecutionJobState {
    return {
      orderId: job.orderId,
      sagaId: job.sagaId,
      orderNumber: job.orderNumber,
      vehiclePlate: job.vehiclePlate,
      status: job.status,
      priority: job.priority,
      priorityRank: PRIORITY_RANK[job.priority],
      services: job.services,
      parts: job.parts,
      mechanicId: job.mechanicId,
      diagnosisNotes: job.diagnosisNotes,
      failureReason: job.failureReason,
      failureDetail: job.failureDetail,
      timeline: job.timeline,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  public static toEntity(record: ExecutionJobRecord): ExecutionJobEntity {
    return ExecutionJobEntity.reconstitute(
      {
        orderId: record.orderId,
        sagaId: record.sagaId,
        orderNumber: record.orderNumber,
        vehiclePlate: record.vehiclePlate,
        status: record.status,
        priority: record.priority,
        services: record.services.map(({ name, quantity }) => ({
          name,
          quantity,
        })),
        parts: record.parts.map(({ name, quantity }) => ({ name, quantity })),
        mechanicId: record.mechanicId ?? undefined,
        diagnosisNotes: record.diagnosisNotes ?? undefined,
        failureReason: record.failureReason ?? undefined,
        failureDetail: record.failureDetail ?? undefined,
        timeline: record.timeline.map(({ status, at, by, note }) =>
          note ? { status, at, by, note } : { status, at, by },
        ),
        version: record.version,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
      record._id,
    );
  }

  public static toPendingEvent(message: OutgoingMessage): PendingEventRecord {
    const carrier: Record<string, string> = {};
    propagation.inject(context.active(), carrier);
    return {
      messageId: message.envelope.messageId,
      exchange: message.exchange,
      routingKey: message.routingKey,
      envelope: message.envelope,
      traceparent: carrier.traceparent,
      tracestate: carrier.tracestate,
      createdAt: new Date(),
    };
  }
}
