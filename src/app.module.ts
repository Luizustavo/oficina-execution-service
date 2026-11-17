import { HttpExceptionFilter } from './infrastructure/presentation/filters/http-exception.filter';
import { HealthController } from './infrastructure/presentation/controllers/health.controller';
import { loggingConfig } from './infrastructure/observability/logging.config';
import { MessagingModule } from './infrastructure/messaging/messaging.module';
import { MongoModule } from './infrastructure/database/mongo/mongo.module';
import { LoggerModule } from 'nestjs-pino';
import { APP_FILTER } from '@nestjs/core';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    LoggerModule.forRoot(loggingConfig()),
    MongoModule,
    MessagingModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
})
export class AppModule {}
