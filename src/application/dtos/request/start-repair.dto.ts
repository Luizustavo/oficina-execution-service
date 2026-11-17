import { IsOptional, IsString, MaxLength } from 'class-validator';

export class StartRepairRequestDto {
  /** O que o diagnóstico encontrou. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  diagnosisNotes?: string;
}
