import {
  ExecutionFailureReason,
  ExecutionJobStatus,
  ExecutionPriority,
} from '@domain/enums/execution-job.enum';

export class WorkItemDto {
  name!: string;
  quantity!: number;
}

export class TimelineEntryDto {
  status!: ExecutionJobStatus;
  at!: Date;
  /** Id do mecânico, ou "system" para mudanças vindas da saga. */
  by!: string;
  note?: string;
}

export class ExecutionJobResponseDto {
  id!: string;
  orderId!: string;
  orderNumber!: string;
  vehiclePlate!: string;
  status!: ExecutionJobStatus;
  priority!: ExecutionPriority;
  services!: WorkItemDto[];
  parts!: WorkItemDto[];
  mechanicId?: string;
  diagnosisNotes?: string;
  failureReason?: ExecutionFailureReason;
  failureDetail?: string;
  /** Do início do diagnóstico até a conclusão, quando o job termina em DONE. */
  durationSeconds?: number;
  timeline!: TimelineEntryDto[];
  createdAt!: Date;
  updatedAt!: Date;
}
