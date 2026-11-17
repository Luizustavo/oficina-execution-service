import { IExecutionJobRepository } from '@domain/repositories/execution-job.repository.interface';
import { ExecutionJobEntity } from '@domain/entities/execution-job/execution-job.entity';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ExecutionPriority } from '@domain/enums/execution-job.enum';
import { jwtConfig } from '@infrastructure/config/jwt.config';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { createHmac, randomUUID } from 'node:crypto';
import { AppModule } from './../src/app.module';
import { Connection } from 'mongoose';
import request from 'supertest';

import type { App } from 'supertest/types';

const base64url = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

const tokenFor = (role: string, sub = randomUUID()) => {
  const header = base64url({ alg: 'HS256', typ: 'JWT' });
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url({
    sub,
    email: `${role.toLowerCase()}@oficina.com`,
    role,
    name: role,
    iat: now,
    exp: now + 300,
  });
  const signature = createHmac('sha256', jwtConfig().jwt.secret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `Bearer ${header}.${payload}.${signature}`;
};

describe('Rotas da fila de execução (e2e)', () => {
  let app: INestApplication<App>;
  let jobs: IExecutionJobRepository;
  const mechanicId = randomUUID();
  const mechanic = tokenFor('MECHANIC', mechanicId);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    jobs = app.get(IExecutionJobRepository);
  });

  afterAll(async () => {
    await app.get<Connection>(getConnectionToken()).dropDatabase();
    await app.close();
  });

  const queuedJob = async (priority = ExecutionPriority.NORMAL) => {
    const job = ExecutionJobEntity.create(
      {
        orderId: randomUUID(),
        sagaId: randomUUID(),
        orderNumber: 'OS-2026-000123',
        vehiclePlate: 'ABC1D23',
        priority,
        services: [{ name: 'Troca de óleo', quantity: 1 }],
        parts: [],
      },
      randomUUID(),
    );
    await jobs.create(job, []);
    return job.id;
  };

  const http = () => request(app.getHttpServer());

  it('exige token', () => http().get('/api/execution/queue').expect(401));

  it.each(['CUSTOMER', 'ATTENDANT'])('recusa o papel %s', (role) =>
    http()
      .get('/api/execution/queue')
      .set('Authorization', tokenFor(role))
      .expect(403),
  );

  it('lista a fila com o mais urgente primeiro', async () => {
    const normal = await queuedJob(ExecutionPriority.NORMAL);
    const high = await queuedJob(ExecutionPriority.HIGH);

    const { body } = await http()
      .get('/api/execution/queue')
      .set('Authorization', tokenFor('ADMIN'))
      .expect(200);

    const ids = (body as { id: string }[]).map((job) => job.id);
    expect(ids.indexOf(high)).toBeLessThan(ids.indexOf(normal));
  });

  it('leva o job até DONE e guarda a linha do tempo', async () => {
    const id = await queuedJob();
    const patch = (action: string, body: object = {}) =>
      http()
        .patch(`/api/execution/jobs/${id}/${action}`)
        .set('Authorization', mechanic)
        .send(body);

    await patch('finish').expect(422);
    const diagnosing = await patch('start-diagnosis').expect(200);
    expect(diagnosing.body).toMatchObject({
      status: 'DIAGNOSING',
      mechanicId,
    });
    await patch('start-repair', { diagnosisNotes: 'Junta vazando' }).expect(
      200,
    );
    const done = await patch('finish', { note: 'Teste ok' }).expect(200);

    expect(done.body).toMatchObject({
      status: 'DONE',
      diagnosisNotes: 'Junta vazando',
    });
    expect(done.body.timeline).toHaveLength(4);
    await patch('start-diagnosis').expect(422);
  });

  it('registra a falha com motivo', async () => {
    const id = await queuedJob();
    const fail = (body: object) =>
      http()
        .patch(`/api/execution/jobs/${id}/fail`)
        .set('Authorization', mechanic)
        .send(body);

    await fail({ reason: 'BROKEN', detail: 'x' }).expect(400);
    await fail({ reason: 'PART_UNAVAILABLE' }).expect(400);
    const { body } = await fail({
      reason: 'PART_UNAVAILABLE',
      detail: 'Filtro em falta no fornecedor',
    }).expect(200);

    expect(body).toMatchObject({
      status: 'FAILED',
      failureReason: 'PART_UNAVAILABLE',
    });
  });

  it('responde 404 para um job que não existe', () =>
    http()
      .get(`/api/execution/jobs/${randomUUID()}`)
      .set('Authorization', mechanic)
      .expect(404));
});
