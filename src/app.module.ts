import { HttpExceptionFilter } from './infrastructure/presentation/filters/http-exception.filter';
import { HealthController } from './infrastructure/presentation/controllers/health.controller';
import { loggingConfig } from './infrastructure/observability/logging.config';
import { LoggerModule } from 'nestjs-pino';
import { APP_FILTER } from '@nestjs/core';
import { Module } from '@nestjs/common';

@Module({
  imports: [LoggerModule.forRoot(loggingConfig())],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
})
export class AppModule {}
