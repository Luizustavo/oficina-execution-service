import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ExecutionFailureReason } from '@domain/enums/execution-job.enum';

export class FailJobRequestDto {
  @IsEnum(ExecutionFailureReason)
  reason!: ExecutionFailureReason;

  /** @example "Filtro de óleo em falta no fornecedor" */
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  detail!: string;
}
