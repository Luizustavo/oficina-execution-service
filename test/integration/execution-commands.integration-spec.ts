import {
  EXECUTION_JOB_MODEL,
  ExecutionJobRecord,
  ExecutionJobSchema,
} from '@infrastructure/database/mongo/schemas/execution-job.schema';
import { ExecutionJobRepository } from '@infrastructure/database/mongo/repositories/execution-job.repository';
import { EnqueueExecutionJobUseCase } from '@application/use-cases/execution-job/enqueue-execution-job.use-case';
import { CancelExecutionJobUseCase } from '@application/use-cases/execution-job/cancel-execution-job.use-case';
import { FinishExecutionJobUseCase } from '@application/use-cases/execution-job/finish-execution-job.use-case';
import { StartDiagnosisUseCase } from '@application/use-cases/execution-job/start-diagnosis.use-case';
import { SagaMessageHandlerRegistry } from '@infrastructure/messaging/saga-message-handler.registry';
import { StartRepairUseCase } from '@application/use-cases/execution-job/start-repair.use-case';
import { ExecutionCommandsConsumer } from '@infrastructure/messaging/execution-commands.consumer';
import { ExecutionCommandHandlers } from '@infrastructure/messaging/execution-command-handlers';
import { RabbitMqMessagePublisher } from '@infrastructure/messaging/rabbitmq-message-publisher';
import { RabbitMqConnection } from '@infrastructure/messaging/rabbitmq-connection.service';
import { EXECUTION_COMMANDS_QUEUE } from '@infrastructure/messaging/topology';
import { OutboxRelayService } from '@infrastructure/messaging/outbox-relay.service';
import { SagaEnvelope, SagaExchange } from '@domain/messaging/saga-message';
import { Connection, createConnection, Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { ExecutionMetrics } from '@infrastructure/observability/execution.metrics';
import { Logger } from '@nestjs/common';
import { connect } from 'amqplib';

import type { Channel, ChannelModel, ConsumeMessage } from 'amqplib';

const CAPTURE_QUEUE = `test.execution-saga-events.${randomUUID()}`;
const MECHANIC = 'mechanic-1';

describe('Comandos do Execution (integração)', () => {
  let mongo: Connection;
  let model: Model<ExecutionJobRecord>;
  let repository: ExecutionJobRepository;
  let connection: RabbitMqConnection;
  let publisher: RabbitMqMessagePublisher;
  let relay: OutboxRelayService;
  let consumer: ExecutionCommandsConsumer;
  let amqp: ChannelModel;
  let probe: Channel;
  const logger = new Logger('execution-test');

  beforeAll(async () => {
    mongo = await createConnection(process.env.MONGODB_URL!).asPromise();
    model = mongo.model<ExecutionJobRecord>(
      EXECUTION_JOB_MODEL,
      ExecutionJobSchema,
    );
    repository = new ExecutionJobRepository(model);
    await repository.onModuleInit();

    connection = new RabbitMqConnection();
    publisher = new RabbitMqMessagePublisher(connection);
    publisher.onModuleInit();
    await publisher.whenReady();
    relay = new OutboxRelayService(model, publisher);

    const registry = new SagaMessageHandlerRegistry();
    new ExecutionCommandHandlers(
      registry,
      new EnqueueExecutionJobUseCase(repository, logger),
      new CancelExecutionJobUseCase(repository, new ExecutionMetrics(), logger),
    ).onModuleInit();
    consumer = new ExecutionCommandsConsumer(connection, publisher, registry);

    amqp = await connect(process.env.RABBITMQ_URL!);
    probe = await amqp.createChannel();
    await probe.assertQueue(CAPTURE_QUEUE, { exclusive: true });
    await probe.bindQueue(CAPTURE_QUEUE, SagaExchange.EVENTS, 'execution.#');
  });

  beforeEach(async () => {
    await model.deleteMany({});
    await probe.purgeQueue(CAPTURE_QUEUE);
    await probe.purgeQueue(`${EXECUTION_COMMANDS_QUEUE}.retry.1`);
    await probe.purgeQueue(`${EXECUTION_COMMANDS_QUEUE}.dlq`);
  });

  afterAll(async () => {
    await probe.purgeQueue(`${EXECUTION_COMMANDS_QUEUE}.retry.1`);
    await amqp.close();
    await publisher.onModuleDestroy();
    await connection.onModuleDestroy();
    await mongo.dropDatabase();
    await mongo.close();
  });

  const command = (
    type: string,
    payload: Record<string, unknown>,
    orderId: string,
  ): SagaEnvelope => ({
    messageId: randomUUID(),
    sagaId: 'saga-1',
    orderId,
    type,
    version: 1,
    occurredAt: new Date().toISOString(),
    payload,
  });

  const enqueue = (orderId: string, overrides: Record<string, unknown> = {}) =>
    command(
      'execution.job.enqueue',
      {
        orderNumber: 'OS-2026-000123',
        vehiclePlate: 'ABC1D23',
        priority: 'HIGH',
        services: [{ name: 'Troca de óleo', quantity: 1 }],
        parts: [{ name: 'Filtro de óleo', quantity: 1 }],
        ...overrides,
      },
      orderId,
    );

  const cancel = (orderId: string) =>
    command('execution.job.cancel', { reason: 'MANUAL_CANCEL' }, orderId);

  const delivery = (envelope: SagaEnvelope): ConsumeMessage => ({
    content: Buffer.from(JSON.stringify(envelope)),
    fields: {} as ConsumeMessage['fields'],
    properties: {
      messageId: envelope.messageId,
      headers: {},
    } as unknown as ConsumeMessage['properties'],
  });

  const publishedEvents = async (): Promise<SagaEnvelope[]> => {
    await relay.publishPending();
    const events: SagaEnvelope[] = [];
    for (let attempt = 0; attempt < 10; attempt++) {
      const message = await probe.get(CAPTURE_QUEUE, { noAck: true });
      if (message) {
        events.push(JSON.parse(message.content.toString()) as SagaEnvelope);
        attempt = 0;
      } else {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    return events;
  };

  const queueSize = async (queue: string) =>
    (await probe.checkQueue(queue)).messageCount;

  it('execution.job.enqueue: cria o job na fila e publica execution.job.queued', async () => {
    const orderId = randomUUID();

    expect(await consumer.handle(delivery(enqueue(orderId)))).toBe('processed');

    const job = await repository.findByOrderId(orderId);
    expect(job).toMatchObject({ status: 'QUEUED', priority: 'HIGH' });
    const [queued] = await publishedEvents();
    expect(queued).toMatchObject({
      type: 'execution.job.queued',
      sagaId: 'saga-1',
      orderId,
      payload: { jobId: job!.id },
    });
  });

  it('execution.job.enqueue repetido não cria outro job nem outro evento', async () => {
    const orderId = randomUUID();
    await consumer.handle(delivery(enqueue(orderId)));
    await publishedEvents();

    expect(await consumer.handle(delivery(enqueue(orderId)))).toBe('processed');

    expect(await model.countDocuments({ orderId })).toBe(1);
    expect(await publishedEvents()).toEqual([]);
  });

  it('execution.job.enqueue inválido vai direto para a DLQ', async () => {
    const invalid = enqueue(randomUUID(), { services: [], parts: [] });

    expect(await consumer.handle(delivery(invalid))).toBe('rejected');
    expect(await model.countDocuments({})).toBe(0);
  });

  it('execution.job.cancel antes do job existir volta para retentativa', async () => {
    expect(await consumer.handle(delivery(cancel(randomUUID())))).toBe(
      'retried',
    );

    expect(await queueSize(`${EXECUTION_COMMANDS_QUEUE}.retry.1`)).toBe(1);
  });

  it('execution.job.cancel interrompe o job e confirma; repetir confirma sem mudar nada', async () => {
    const orderId = randomUUID();
    await consumer.handle(delivery(enqueue(orderId)));
    const job = await repository.findByOrderId(orderId);
    await new StartDiagnosisUseCase(repository, logger).execute(
      job!.id,
      MECHANIC,
    );

    expect(await consumer.handle(delivery(cancel(orderId)))).toBe('processed');
    expect(await consumer.handle(delivery(cancel(orderId)))).toBe('processed');

    const stored = await model.findById(job!.id).lean<ExecutionJobRecord>();
    expect(stored?.status).toBe('CANCELED');
    expect(stored?.timeline.map((entry) => entry.status)).toEqual([
      'QUEUED',
      'DIAGNOSING',
      'CANCELED',
    ]);
    expect((await publishedEvents()).map((event) => event.type)).toEqual([
      'execution.job.queued',
      'execution.job.started',
      'execution.job.canceled',
      'execution.job.canceled',
    ]);
  });

  it('mecânico leva o job até DONE: started e completed, linha do tempo com 4 entradas', async () => {
    const orderId = randomUUID();
    await consumer.handle(delivery(enqueue(orderId)));
    const { id } = (await repository.findByOrderId(orderId))!;

    await new StartDiagnosisUseCase(repository, logger).execute(id, MECHANIC);
    await new StartRepairUseCase(repository, logger).execute(
      id,
      MECHANIC,
      'Junta do cárter vazando',
    );
    await new FinishExecutionJobUseCase(
      repository,
      new ExecutionMetrics(),
      logger,
    ).execute(id, MECHANIC);

    const stored = await model.findById(id).lean<ExecutionJobRecord>();
    expect(stored?.timeline).toHaveLength(4);
    expect(stored?.diagnosisNotes).toBe('Junta do cárter vazando');
    const events = await publishedEvents();
    expect(events.map((event) => event.type)).toEqual([
      'execution.job.queued',
      'execution.job.started',
      'execution.job.completed',
    ]);
    expect(events[2].payload).toMatchObject({
      jobId: id,
      durationSeconds: expect.any(Number),
    });
  });
});
