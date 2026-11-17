import {
  ExecutionFailureReason,
  ExecutionJobStatus,
  ExecutionPriority,
} from '@domain/enums/execution-job.enum';
import { SagaEnvelope } from '@domain/messaging/saga-message';
import { Schema } from 'mongoose';

export const EXECUTION_JOB_MODEL = 'ExecutionJob';

export interface WorkItemRecord {
  name: string;
  quantity: number;
}

export interface TimelineEntryRecord {
  status: ExecutionJobStatus;
  at: Date;
  by: string;
  note?: string;
}

export interface PendingEventRecord {
  messageId: string;
  exchange: string;
  routingKey: string;
  envelope: SagaEnvelope;
  traceparent?: string;
  tracestate?: string;
  createdAt: Date;
}

export interface ExecutionJobRecord {
  _id: string;
  orderId: string;
  sagaId: string;
  orderNumber: string;
  vehiclePlate: string;
  status: ExecutionJobStatus;
  priority: ExecutionPriority;
  priorityRank: number;
  services: WorkItemRecord[];
  parts: WorkItemRecord[];
  mechanicId?: string;
  diagnosisNotes?: string;
  failureReason?: ExecutionFailureReason;
  failureDetail?: string;
  timeline: TimelineEntryRecord[];
  pendingEvents: PendingEventRecord[];
  relayLeaseUntil?: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const workItem = new Schema<WorkItemRecord>(
  {
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
  },
  { _id: false },
);

const timelineEntry = new Schema<TimelineEntryRecord>(
  {
    status: {
      type: String,
      enum: Object.values(ExecutionJobStatus),
      required: true,
    },
    at: { type: Date, required: true },
    by: { type: String, required: true },
    note: String,
  },
  { _id: false },
);

const pendingEvent = new Schema<PendingEventRecord>(
  {
    messageId: { type: String, required: true },
    exchange: { type: String, required: true },
    routingKey: { type: String, required: true },
    envelope: { type: Schema.Types.Mixed, required: true },
    traceparent: String,
    tracestate: String,
    createdAt: { type: Date, required: true },
  },
  { _id: false },
);

export const ExecutionJobSchema = new Schema<ExecutionJobRecord>(
  {
    _id: { type: String, required: true },
    orderId: { type: String, required: true },
    sagaId: { type: String, required: true },
    orderNumber: { type: String, required: true },
    vehiclePlate: { type: String, required: true },
    status: {
      type: String,
      enum: Object.values(ExecutionJobStatus),
      required: true,
    },
    priority: {
      type: String,
      enum: Object.values(ExecutionPriority),
      required: true,
    },
    priorityRank: { type: Number, required: true },
    services: { type: [workItem], default: [] },
    parts: { type: [workItem], default: [] },
    mechanicId: String,
    diagnosisNotes: String,
    failureReason: {
      type: String,
      enum: Object.values(ExecutionFailureReason),
    },
    failureDetail: String,
    timeline: { type: [timelineEntry], default: [] },
    pendingEvents: { type: [pendingEvent], default: [] },
    relayLeaseUntil: { type: Date, default: null },
    version: { type: Number, required: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { collection: 'execution_jobs', versionKey: false, minimize: false },
);

ExecutionJobSchema.index({ orderId: 1 }, { unique: true });
ExecutionJobSchema.index({ status: 1, priorityRank: 1, createdAt: 1 });
ExecutionJobSchema.index(
  { relayLeaseUntil: 1 },
  { partialFilterExpression: { 'pendingEvents.0': { $exists: true } } },
);
