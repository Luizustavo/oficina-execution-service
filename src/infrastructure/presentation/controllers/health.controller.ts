import { Public } from '@infrastructure/presentation/decorators/public.decorator';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Controller, Get } from '@nestjs/common';

@ApiTags('health')
@Public()
@Controller('api/execution/health')
export class HealthController {
  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe' })
  ready() {
    return { status: 'ok' };
  }
}
