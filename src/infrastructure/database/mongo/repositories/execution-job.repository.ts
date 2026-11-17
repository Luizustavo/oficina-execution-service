import {
  EXECUTION_JOB_MODEL,
  ExecutionJobRecord,
} from '@infrastructure/database/mongo/schemas/execution-job.schema';
import { IExecutionJobRepository } from '@domain/repositories/execution-job.repository.interface';
import {
  ACTIVE_STATUSES,
  ExecutionJobEntity,
} from '@domain/entities/execution-job/execution-job.entity';
import { ConcurrentModificationException } from '@shared/exceptions/domain.exceptions';
import { MongoExecutionJobMapper } from '../mappers/mongo-execution-job.mapper';
import { OutgoingMessage } from '@domain/messaging/saga-message';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ExecutionJobStatus } from '@domain/enums/execution-job.enum';
import { Model, mongo } from 'mongoose';

const DUPLICATE_KEY = 11000;

@Injectable()
export class ExecutionJobRepository
  implements IExecutionJobRepository, OnModuleInit
{
  constructor(
    @InjectModel(EXECUTION_JOB_MODEL)
    private readonly model: Model<ExecutionJobRecord>,
  ) {}

  // A idempotência do enqueue depende do índice único de orderId já existir.
  async onModuleInit(): Promise<void> {
    await this.model.init();
  }

  async create(
    job: ExecutionJobEntity,
    events: OutgoingMessage[],
  ): Promise<boolean> {
    try {
      await this.model.create({
        _id: job.id,
        ...MongoExecutionJobMapper.toState(job),
        pendingEvents: events.map((event) =>
          MongoExecutionJobMapper.toPendingEvent(event),
        ),
        relayLeaseUntil: null,
        version: job.version,
      });
      return true;
    } catch (error) {
      if (
        error instanceof mongo.MongoServerError &&
        error.code === DUPLICATE_KEY
      ) {
        return false;
      }
      throw error;
    }
  }

  async save(
    job: ExecutionJobEntity,
    events: OutgoingMessage[],
  ): Promise<void> {
    const pendingEvents = events.map((event) =>
      MongoExecutionJobMapper.toPendingEvent(event),
    );
    const result = await this.model.updateOne(
      { _id: job.id, version: job.version },
      {
        $set: {
          ...MongoExecutionJobMapper.toState(job),
          version: job.version + 1,
        },
        ...(pendingEvents.length > 0 && {
          $push: { pendingEvents: { $each: pendingEvents } },
        }),
      },
    );
    if (result.matchedCount === 0) {
      throw new ConcurrentModificationException('ExecutionJob', job.id);
    }
  }

  async findById(id: string): Promise<ExecutionJobEntity | null> {
    const record = await this.model.findById(id).lean<ExecutionJobRecord>();
    return record ? MongoExecutionJobMapper.toEntity(record) : null;
  }

  async findByOrderId(orderId: string): Promise<ExecutionJobEntity | null> {
    const record = await this.model
      .findOne({ orderId })
      .lean<ExecutionJobRecord>();
    return record ? MongoExecutionJobMapper.toEntity(record) : null;
  }

  async findActive(limit: number): Promise<ExecutionJobEntity[]> {
    const records = await this.model
      .find({ status: { $in: ACTIVE_STATUSES } })
      .sort({ priorityRank: 1, createdAt: 1 })
      .limit(limit)
      .lean<ExecutionJobRecord[]>();
    return records.map((record) => MongoExecutionJobMapper.toEntity(record));
  }

  async countActiveByStatus(): Promise<
    Partial<Record<ExecutionJobStatus, number>>
  > {
    const groups = await this.model.aggregate<{
      _id: ExecutionJobStatus;
      count: number;
    }>([
      { $match: { status: { $in: ACTIVE_STATUSES } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    return Object.fromEntries(groups.map((group) => [group._id, group.count]));
  }
}
