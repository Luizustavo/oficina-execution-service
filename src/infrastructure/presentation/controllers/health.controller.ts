import { Public } from '@infrastructure/presentation/decorators/public.decorator';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { InjectConnection } from '@nestjs/mongoose';
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Connection } from 'mongoose';

@ApiTags('health')
@Public()
@Controller('api/execution/health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe: MongoDB reachable' })
  async ready() {
    try {
      await this.connection.db?.admin().ping();
    } catch {
      throw new ServiceUnavailableException('MongoDB unreachable');
    }
    return { status: 'ok' };
  }
}
