import { ExecutionJobResponseDto } from '@application/dtos/response/execution-job.dto';
import { ExecutionJobEntity } from '@domain/entities/execution-job/execution-job.entity';

export class ExecutionJobMapper {
  private constructor() {
    throw new Error(
      'ExecutionJobMapper is a static class and cannot be instantiated.',
    );
  }

  public static toResponse(job: ExecutionJobEntity): ExecutionJobResponseDto {
    return {
      id: job.id,
      orderId: job.orderId,
      orderNumber: job.orderNumber,
      vehiclePlate: job.vehiclePlate,
      status: job.status,
      priority: job.priority,
      services: job.services,
      parts: job.parts,
      mechanicId: job.mechanicId,
      diagnosisNotes: job.diagnosisNotes,
      failureReason: job.failureReason,
      failureDetail: job.failureDetail,
      durationSeconds: job.durationSeconds,
      timeline: job.timeline,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }
}
