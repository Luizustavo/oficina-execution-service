import {
  EXECUTION_JOB_MODEL,
  ExecutionJobRecord,
  ExecutionJobSchema,
} from '@infrastructure/database/mongo/schemas/execution-job.schema';
import { ExecutionJobRepository } from '@infrastructure/database/mongo/repositories/execution-job.repository';
import { RabbitMqMessagePublisher } from '@infrastructure/messaging/rabbitmq-message-publisher';
import { ExecutionJobEntity } from '@domain/entities/execution-job/execution-job.entity';
import { ConcurrentModificationException } from '@shared/exceptions/domain.exceptions';
import { RabbitMqConnection } from '@infrastructure/messaging/rabbitmq-connection.service';
import {
  buildSagaEvent,
  OutgoingMessage,
  SagaExchange,
} from '@domain/messaging/saga-message';
import { OutboxRelayService } from '@infrastructure/messaging/outbox-relay.service';
import { ExecutionPriority } from '@domain/enums/execution-job.enum';
import { Connection, createConnection, Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { connect } from 'amqplib';

import type { Channel, ChannelModel, GetMessage } from 'amqplib';

const CAPTURE_QUEUE = `test.execution-events.${randomUUID()}`;

const newJob = (priority = ExecutionPriority.NORMAL) =>
  ExecutionJobEntity.create(
    {
      orderId: randomUUID(),
      sagaId: randomUUID(),
      orderNumber: 'OS-2026-000123',
      vehiclePlate: 'ABC1D23',
      priority,
      services: [{ name: 'Troca de óleo', quantity: 1 }],
      parts: [{ name: 'Filtro de óleo', quantity: 1 }],
    },
    randomUUID(),
  );

const eventFor = (
  job: ExecutionJobEntity,
  type: string,
  payload: Record<string, unknown> = { jobId: job.id },
): OutgoingMessage =>
  buildSagaEvent({
    messageId: randomUUID(),
    command: { sagaId: job.sagaId, orderId: job.orderId },
    type,
    occurredAt: new Date(),
    payload,
  });

describe('Execution Service (integração)', () => {
  let mongo: Connection;
  let model: Model<ExecutionJobRecord>;
  let repository: ExecutionJobRepository;
  let connection: RabbitMqConnection;
  let publisher: RabbitMqMessagePublisher;
  let relay: OutboxRelayService;
  let amqp: ChannelModel;
  let probe: Channel;

  beforeAll(async () => {
    mongo = await createConnection(process.env.MONGODB_URL!).asPromise();
    model = mongo.model<ExecutionJobRecord>(
      EXECUTION_JOB_MODEL,
      ExecutionJobSchema,
    );
    await model.deleteMany({});
    repository = new ExecutionJobRepository(model);
    await repository.onModuleInit();

    connection = new RabbitMqConnection();
    publisher = new RabbitMqMessagePublisher(connection);
    publisher.onModuleInit();
    await publisher.whenReady();
    relay = new OutboxRelayService(model, publisher);

    amqp = await connect(process.env.RABBITMQ_URL!);
    probe = await amqp.createChannel();
    await probe.assertQueue(CAPTURE_QUEUE, { exclusive: true });
    await probe.bindQueue(CAPTURE_QUEUE, SagaExchange.EVENTS, 'execution.#');
  });

  afterAll(async () => {
    await amqp.close();
    await publisher.onModuleDestroy();
    await connection.onModuleDestroy();
    await mongo.dropDatabase();
    await mongo.close();
  });

  beforeEach(async () => {
    await model.deleteMany({});
    await probe.purgeQueue(CAPTURE_QUEUE);
  });

  async function captured(): Promise<{ type: string; traceparent?: string }[]> {
    const messages: { type: string; traceparent?: string }[] = [];
    let message: GetMessage | false;
    while ((message = await probe.get(CAPTURE_QUEUE, { noAck: true }))) {
      messages.push({
        type: message.properties.type as string,
        traceparent: message.properties.headers?.traceparent as
          | string
          | undefined,
      });
    }
    return messages;
  }

  describe('repositório', () => {
    it('grava o job com o evento pendente e lê de volta igual', async () => {
      const job = newJob(ExecutionPriority.HIGH);

      expect(
        await repository.create(job, [eventFor(job, 'execution.job.queued')]),
      ).toBe(true);

      const stored = await model.findById(job.id).lean<ExecutionJobRecord>();
      expect(stored?.priorityRank).toBe(0);
      expect(stored?.pendingEvents.map((event) => event.routingKey)).toEqual([
        'execution.job.queued',
      ]);
      expect(await repository.findByOrderId(job.orderId)).toEqual(job);
      expect(await repository.findById(job.id)).toEqual(job);
      expect(await repository.findById(randomUUID())).toBeNull();
    });

    it('não cria um segundo job para a mesma OS', async () => {
      const job = newJob();
      await repository.create(job, [eventFor(job, 'execution.job.queued')]);
      const repeated = ExecutionJobEntity.create(
        {
          orderId: job.orderId,
          sagaId: job.sagaId,
          orderNumber: job.orderNumber,
          vehiclePlate: job.vehiclePlate,
          priority: job.priority,
          services: job.services,
          parts: job.parts,
        },
        randomUUID(),
      );

      expect(
        await repository.create(repeated, [
          eventFor(repeated, 'execution.job.queued'),
        ]),
      ).toBe(false);
      expect(await model.countDocuments({ orderId: job.orderId })).toBe(1);
    });

    it('muda o status e enfileira o evento na mesma escrita', async () => {
      const job = newJob();
      await repository.create(job, [eventFor(job, 'execution.job.queued')]);

      const loaded = (await repository.findById(job.id))!;
      loaded.startDiagnosis('mechanic-1');
      await repository.save(loaded, [
        eventFor(loaded, 'execution.job.started'),
      ]);

      const stored = await model.findById(job.id).lean<ExecutionJobRecord>();
      expect(stored?.status).toBe('DIAGNOSING');
      expect(stored?.mechanicId).toBe('mechanic-1');
      expect(stored?.version).toBe(1);
      expect(stored?.timeline).toHaveLength(2);
      expect(stored?.pendingEvents.map((event) => event.routingKey)).toEqual([
        'execution.job.queued',
        'execution.job.started',
      ]);
    });

    it('recusa gravar por cima de uma alteração concorrente', async () => {
      const job = newJob();
      await repository.create(job, []);
      const first = (await repository.findById(job.id))!;
      const second = (await repository.findById(job.id))!;

      first.startDiagnosis('mechanic-1');
      await repository.save(first, [eventFor(first, 'execution.job.started')]);
      second.cancel('MANUAL_CANCEL');

      await expect(
        repository.save(second, [eventFor(second, 'execution.job.canceled')]),
      ).rejects.toThrow(ConcurrentModificationException);
      const stored = await model.findById(job.id).lean<ExecutionJobRecord>();
      expect(stored?.status).toBe('DIAGNOSING');
      expect(stored?.pendingEvents).toHaveLength(1);
    });
  });

  describe('relay do outbox embutido', () => {
    it('publica os eventos de cada job em ordem e tira do documento', async () => {
      const job = newJob();
      await repository.create(job, [eventFor(job, 'execution.job.queued')]);
      const loaded = (await repository.findById(job.id))!;
      loaded.startDiagnosis('mechanic-1');
      await repository.save(loaded, [
        eventFor(loaded, 'execution.job.started'),
      ]);

      expect(await relay.publishPending()).toBe(2);

      expect((await captured()).map((message) => message.type)).toEqual([
        'execution.job.queued',
        'execution.job.started',
      ]);
      const stored = await model.findById(job.id).lean<ExecutionJobRecord>();
      expect(stored?.pendingEvents).toEqual([]);
      expect(stored?.relayLeaseUntil).toBeNull();
      expect(await relay.publishPending()).toBe(0);
    });

    it('para no primeiro evento sem fila e mantém o resto pendente', async () => {
      const job = newJob();
      const unroutable = {
        ...eventFor(job, 'execution.job.queued'),
        routingKey: 'ninguem.escuta',
      };
      await repository.create(job, [
        unroutable,
        eventFor(job, 'execution.job.started'),
      ]);

      expect(await relay.publishPending()).toBe(0);

      expect(await captured()).toEqual([]);
      const stored = await model.findById(job.id).lean<ExecutionJobRecord>();
      expect(stored?.pendingEvents).toHaveLength(2);
      expect(stored?.relayLeaseUntil).toBeNull();
    });

    it('não publica um job que outra réplica está publicando', async () => {
      const job = newJob();
      await repository.create(job, [eventFor(job, 'execution.job.queued')]);
      await model.updateOne(
        { _id: job.id },
        { $set: { relayLeaseUntil: new Date(Date.now() + 60_000) } },
      );

      expect(await relay.publishPending()).toBe(0);

      await model.updateOne(
        { _id: job.id },
        { $set: { relayLeaseUntil: new Date(Date.now() - 1_000) } },
      );
      expect(await relay.publishPending()).toBe(1);
    });
  });
});
