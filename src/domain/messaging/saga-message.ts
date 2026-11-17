import { InvalidMessageException } from '@shared/exceptions/domain.exceptions';

export interface SagaEnvelope<P = Record<string, unknown>> {
  messageId: string;
  sagaId: string;
  orderId: string;
  type: string;
  version: number;
  occurredAt: string;
  payload: P;
}

export const SagaExchange = {
  COMMANDS: 'saga.commands',
  EVENTS: 'saga.events',
  DEAD_LETTER: 'saga.dlx',
} as const;

export interface OutgoingMessage {
  exchange: string;
  routingKey: string;
  envelope: SagaEnvelope;
}

export function buildSagaEvent(params: {
  messageId: string;
  command: Pick<SagaEnvelope, 'sagaId' | 'orderId'>;
  type: string;
  version?: number;
  occurredAt: Date;
  payload: Record<string, unknown>;
}): OutgoingMessage {
  return {
    exchange: SagaExchange.EVENTS,
    routingKey: params.type,
    envelope: {
      messageId: params.messageId,
      sagaId: params.command.sagaId,
      orderId: params.command.orderId,
      type: params.type,
      version: params.version ?? 1,
      occurredAt: params.occurredAt.toISOString(),
      payload: params.payload,
    },
  };
}

const REQUIRED_STRINGS = [
  'messageId',
  'sagaId',
  'orderId',
  'type',
  'occurredAt',
] as const;

export function parseSagaEnvelope(body: string): SagaEnvelope {
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    throw new InvalidMessageException('Message body is not valid JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new InvalidMessageException('Message body is not a JSON object');
  }

  const candidate = raw as Record<string, unknown>;
  for (const field of REQUIRED_STRINGS) {
    const value = candidate[field];
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new InvalidMessageException(`Envelope field "${field}" is missing`);
    }
  }
  if (!Number.isInteger(candidate.version) || Number(candidate.version) < 1) {
    throw new InvalidMessageException('Envelope field "version" is invalid');
  }
  const payload = candidate.payload;
  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload)
  ) {
    throw new InvalidMessageException('Envelope field "payload" is missing');
  }

  return candidate as unknown as SagaEnvelope;
}
