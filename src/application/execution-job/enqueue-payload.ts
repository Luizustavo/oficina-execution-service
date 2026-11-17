import {
  CreateExecutionJobProps,
  WorkItem,
} from '@domain/entities/execution-job/execution-job.entity';
import { InvalidMessageException } from '@shared/exceptions/domain.exceptions';
import { ExecutionPriority } from '@domain/enums/execution-job.enum';

export type EnqueueCommand = Omit<
  CreateExecutionJobProps,
  'orderId' | 'sagaId'
>;

type Raw = Record<string, unknown>;

const invalid = (detail: string): never => {
  throw new InvalidMessageException(`Invalid execution.job.enqueue: ${detail}`);
};

const text = (source: Raw, field: string): string => {
  const value = source[field];
  return typeof value === 'string' && value.trim() !== ''
    ? value
    : invalid(`field "${field}" is missing`);
};

const items = (source: Raw, field: 'services' | 'parts'): WorkItem[] => {
  const value = source[field] ?? [];
  if (!Array.isArray(value)) {
    return invalid(`field "${field}" is not a list`);
  }
  return value.map((item: unknown, index) => {
    if (typeof item !== 'object' || item === null) {
      return invalid(`${field}[${index}] is not an object`);
    }
    const raw = item as Raw;
    return { name: text(raw, 'name'), quantity: Number(raw.quantity) };
  });
};

const priority = (source: Raw): ExecutionPriority => {
  const value = source.priority ?? ExecutionPriority.NORMAL;
  return Object.values(ExecutionPriority).includes(value as ExecutionPriority)
    ? (value as ExecutionPriority)
    : invalid(`priority ${JSON.stringify(value)} is unknown`);
};

/** Payload de `execution.job.enqueue` (contratos-de-mensagens.md, seção 5). */
export function parseEnqueuePayload(payload: Raw): EnqueueCommand {
  return {
    orderNumber: text(payload, 'orderNumber'),
    vehiclePlate: text(payload, 'vehiclePlate'),
    priority: priority(payload),
    services: items(payload, 'services'),
    parts: items(payload, 'parts'),
  };
}
