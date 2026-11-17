import { HttpExceptionFilter } from './infrastructure/presentation/filters/http-exception.filter';
import { ExecutionModule } from './infrastructure/presentation/modules/execution.module';
import { HealthController } from './infrastructure/presentation/controllers/health.controller';
import { JwtAuthGuard } from './infrastructure/presentation/guards/jwt-auth.guard';
import { MessagingModule } from './infrastructure/messaging/messaging.module';
import { RolesGuard } from './infrastructure/presentation/guards/roles.guard';
import { loggingConfig } from './infrastructure/observability/logging.config';
import { MongoModule } from './infrastructure/database/mongo/mongo.module';
import { JwtStrategy } from './infrastructure/config/jwt.strategy';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { LoggerModule } from 'nestjs-pino';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    LoggerModule.forRoot(loggingConfig()),
    PassportModule,
    MongoModule,
    MessagingModule,
    ExecutionModule,
  ],
  controllers: [HealthController],
  providers: [
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
