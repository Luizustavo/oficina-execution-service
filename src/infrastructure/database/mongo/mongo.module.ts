import { IExecutionJobRepository } from '@domain/repositories/execution-job.repository.interface';
import {
  EXECUTION_JOB_MODEL,
  ExecutionJobSchema,
} from './schemas/execution-job.schema';
import { ExecutionJobRepository } from './repositories/execution-job.repository';
import { mongoConfig } from '@infrastructure/config/mongo.config';
import { MongooseModule } from '@nestjs/mongoose';
import { Global, Module } from '@nestjs/common';

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      useFactory: () => {
        const config = mongoConfig();
        return {
          uri: config.uri,
          serverSelectionTimeoutMS: config.serverSelectionTimeoutMs,
        };
      },
    }),
    MongooseModule.forFeature([
      { name: EXECUTION_JOB_MODEL, schema: ExecutionJobSchema },
    ]),
  ],
  providers: [
    { provide: IExecutionJobRepository, useClass: ExecutionJobRepository },
  ],
  exports: [MongooseModule, IExecutionJobRepository],
})
export class MongoModule {}
