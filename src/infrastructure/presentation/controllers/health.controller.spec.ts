import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import { Connection } from 'mongoose';

const controllerWith = (ping: jest.Mock) =>
  new HealthController({
    db: { admin: () => ({ ping }) },
  } as unknown as Connection);

describe('HealthController', () => {
  it('is ready when MongoDB answers', async () => {
    await expect(
      controllerWith(jest.fn().mockResolvedValue({ ok: 1 })).ready(),
    ).resolves.toEqual({ status: 'ok' });
  });

  it('answers 503 instead of 500 while MongoDB is down', async () => {
    await expect(
      controllerWith(
        jest.fn().mockRejectedValue(new Error('interrupted at shutdown')),
      ).ready(),
    ).rejects.toThrow(ServiceUnavailableException);
  });
});
