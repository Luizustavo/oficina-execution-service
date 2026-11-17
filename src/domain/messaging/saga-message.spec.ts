import { InvalidMessageException } from '@shared/exceptions/domain.exceptions';
import {
  buildSagaEvent,
  parseSagaEnvelope,
  SagaExchange,
} from './saga-message';

const validEnvelope = {
  messageId: '6f1c2a0e-5b7d-4e8a-9c3f-1a2b3c4d5e6f',
  sagaId: '0d9e8f7a-6b5c-4d3e-2f1a-0b9c8d7e6f5a',
  orderId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  type: 'execution.job.queued',
  version: 1,
  occurredAt: '2026-11-14T13:45:00.000Z',
  payload: { jobId: 'j-1' },
};

describe('buildSagaEvent', () => {
  it('should answer a command on saga.events with the same saga and order', () => {
    const event = buildSagaEvent({
      messageId: 'm-2',
      command: { sagaId: 's-1', orderId: 'o-1' },
      type: 'execution.job.queued',
      occurredAt: new Date('2026-11-17T10:00:00.000Z'),
      payload: { jobId: 'j-1' },
    });
    expect(event).toEqual({
      exchange: SagaExchange.EVENTS,
      routingKey: 'execution.job.queued',
      envelope: {
        messageId: 'm-2',
        sagaId: 's-1',
        orderId: 'o-1',
        type: 'execution.job.queued',
        version: 1,
        occurredAt: '2026-11-17T10:00:00.000Z',
        payload: { jobId: 'j-1' },
      },
    });
  });
});

describe('parseSagaEnvelope', () => {
  it('should accept a valid envelope', () => {
    expect(parseSagaEnvelope(JSON.stringify(validEnvelope))).toEqual(
      validEnvelope,
    );
  });

  it.each([
    ['broken JSON', '{"messageId":'],
    ['a JSON array', '[]'],
    ['a JSON string', '"hello"'],
    ['null', 'null'],
  ])('should reject %s', (_label, body) => {
    expect(() => parseSagaEnvelope(body)).toThrow(InvalidMessageException);
  });

  it.each(['messageId', 'sagaId', 'orderId', 'type', 'occurredAt'])(
    'should reject an envelope without %s',
    (field) => {
      const body = JSON.stringify({ ...validEnvelope, [field]: undefined });
      expect(() => parseSagaEnvelope(body)).toThrow(InvalidMessageException);
    },
  );

  it('should reject an empty messageId', () => {
    const body = JSON.stringify({ ...validEnvelope, messageId: '  ' });
    expect(() => parseSagaEnvelope(body)).toThrow(InvalidMessageException);
  });

  it.each([0, -1, 1.5, '1', null])('should reject version %p', (version) => {
    const body = JSON.stringify({ ...validEnvelope, version });
    expect(() => parseSagaEnvelope(body)).toThrow(InvalidMessageException);
  });

  it.each([null, 'text', [], undefined])(
    'should reject payload %p',
    (payload) => {
      const body = JSON.stringify({ ...validEnvelope, payload });
      expect(() => parseSagaEnvelope(body)).toThrow(InvalidMessageException);
    },
  );
});
