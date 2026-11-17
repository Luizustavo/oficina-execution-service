export enum ExecutionJobStatus {
  QUEUED = 'QUEUED',
  DIAGNOSING = 'DIAGNOSING',
  REPAIRING = 'REPAIRING',
  DONE = 'DONE',
  FAILED = 'FAILED',
  CANCELED = 'CANCELED',
}

export enum ExecutionPriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
}

export enum ExecutionFailureReason {
  PART_UNAVAILABLE = 'PART_UNAVAILABLE',
  TECHNICAL_ISSUE = 'TECHNICAL_ISSUE',
  CUSTOMER_REQUEST = 'CUSTOMER_REQUEST',
  OTHER = 'OTHER',
}
