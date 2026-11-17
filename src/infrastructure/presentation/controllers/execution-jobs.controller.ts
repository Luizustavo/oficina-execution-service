import {
  CurrentUser,
  JwtPayload,
} from '@infrastructure/presentation/decorators/current-user.decorator';
import { FinishExecutionJobUseCase } from '@application/use-cases/execution-job/finish-execution-job.use-case';
import { ListExecutionQueueUseCase } from '@application/use-cases/execution-job/list-execution-queue.use-case';
import { FailExecutionJobUseCase } from '@application/use-cases/execution-job/fail-execution-job.use-case';
import { GetExecutionJobUseCase } from '@application/use-cases/execution-job/get-execution-job.use-case';
import { StartDiagnosisUseCase } from '@application/use-cases/execution-job/start-diagnosis.use-case';
import { StartRepairUseCase } from '@application/use-cases/execution-job/start-repair.use-case';
import { StartRepairRequestDto } from '@application/dtos/request/start-repair.dto';
import { Roles } from '@infrastructure/presentation/decorators/roles.decorator';
import { FinishJobRequestDto } from '@application/dtos/request/finish-job.dto';
import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FailJobRequestDto } from '@application/dtos/request/fail-job.dto';
import { TokenRole } from '@domain/enums/token-role.enum';

@ApiTags('execution')
@ApiBearerAuth()
@Controller('api/execution')
@Roles(TokenRole.MECHANIC, TokenRole.ADMIN)
export class ExecutionJobsController {
  constructor(
    private readonly listQueue: ListExecutionQueueUseCase,
    private readonly getJob: GetExecutionJobUseCase,
    private readonly startDiagnosis: StartDiagnosisUseCase,
    private readonly startRepair: StartRepairUseCase,
    private readonly finishJob: FinishExecutionJobUseCase,
    private readonly failJob: FailExecutionJobUseCase,
  ) {}

  @Get('queue')
  @ApiOperation({
    summary: 'Jobs in progress, most urgent first, then the oldest',
  })
  queue() {
    return this.listQueue.execute();
  }

  @Get('jobs/:id')
  @ApiOperation({ summary: 'Execution job with its timeline' })
  findOne(@Param('id') id: string) {
    return this.getJob.execute(id);
  }

  @Patch('jobs/:id/start-diagnosis')
  @ApiOperation({
    summary: 'QUEUED → DIAGNOSING: publishes execution.job.started',
  })
  diagnose(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.startDiagnosis.execute(id, user.sub);
  }

  @Patch('jobs/:id/start-repair')
  @ApiOperation({ summary: 'DIAGNOSING → REPAIRING (internal, no event)' })
  repair(
    @Param('id') id: string,
    @Body() dto: StartRepairRequestDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.startRepair.execute(id, user.sub, dto.diagnosisNotes);
  }

  @Patch('jobs/:id/finish')
  @ApiOperation({
    summary: 'REPAIRING → DONE: publishes execution.job.completed',
  })
  finish(
    @Param('id') id: string,
    @Body() dto: FinishJobRequestDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.finishJob.execute(id, user.sub, dto.note);
  }

  @Patch('jobs/:id/fail')
  @ApiOperation({
    summary:
      'Any active status → FAILED: publishes execution.job.failed and the saga refunds the customer',
  })
  fail(
    @Param('id') id: string,
    @Body() dto: FailJobRequestDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.failJob.execute(id, user.sub, dto.reason, dto.detail);
  }
}
