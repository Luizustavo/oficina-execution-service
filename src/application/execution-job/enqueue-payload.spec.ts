import { InvalidMessageException } from '@shared/exceptions/domain.exceptions';
import { ExecutionPriority } from '@domain/enums/execution-job.enum';
import { parseEnqueuePayload } from './enqueue-payload';

const payload = (overrides: Record<string, unknown> = {}) => ({
  orderNumber: 'OS-2026-000123',
  vehiclePlate: 'ABC1D23',
  priority: 'HIGH',
  services: [{ name: 'Troca de óleo', quantity: 1 }],
  parts: [{ name: 'Filtro de óleo', quantity: 2 }],
  ...overrides,
});

describe('parseEnqueuePayload', () => {
  it('reads the contract payload', () => {
    expect(parseEnqueuePayload(payload())).toEqual({
      orderNumber: 'OS-2026-000123',
      vehiclePlate: 'ABC1D23',
      priority: ExecutionPriority.HIGH,
      services: [{ name: 'Troca de óleo', quantity: 1 }],
      parts: [{ name: 'Filtro de óleo', quantity: 2 }],
    });
  });

  it('defaults to NORMAL priority and empty item lists', () => {
    const parsed = parseEnqueuePayload(
      payload({ priority: undefined, parts: undefined }),
    );

    expect(parsed.priority).toBe(ExecutionPriority.NORMAL);
    expect(parsed.parts).toEqual([]);
  });

  it.each([
    [
      'a missing orderNumber',
      { orderNumber: '' },
      'field "orderNumber" is missing',
    ],
    [
      'a missing vehiclePlate',
      { vehiclePlate: 42 },
      'field "vehiclePlate" is missing',
    ],
    [
      'an unknown priority',
      { priority: 'URGENT' },
      'priority "URGENT" is unknown',
    ],
    [
      'services that are not a list',
      { services: 'oil' },
      'field "services" is not a list',
    ],
    [
      'an item that is not an object',
      { parts: ['filtro'] },
      'parts[0] is not an object',
    ],
    [
      'an item without name',
      { parts: [{ quantity: 1 }] },
      'field "name" is missing',
    ],
  ])('rejects %s', (_label, overrides, message) => {
    expect(() => parseEnqueuePayload(payload(overrides))).toThrow(
      InvalidMessageException,
    );
    expect(() => parseEnqueuePayload(payload(overrides))).toThrow(message);
  });
});
