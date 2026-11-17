import {
  ExecutionFailureReason,
  ExecutionJobStatus,
  ExecutionPriority,
} from '@domain/enums/execution-job.enum';
import {
  InvalidStatusTransitionException,
  BusinessRuleException,
} from '@shared/exceptions/domain.exceptions';

export const SYSTEM_ACTOR = 'system';

export interface WorkItem {
  name: string;
  quantity: number;
}

export interface TimelineEntry {
  status: ExecutionJobStatus;
  at: Date;
  by: string;
  note?: string;
}

export interface ExecutionJobProps {
  orderId: string;
  sagaId: string;
  orderNumber: string;
  vehiclePlate: string;
  status: ExecutionJobStatus;
  priority: ExecutionPriority;
  services: WorkItem[];
  parts: WorkItem[];
  mechanicId?: string;
  diagnosisNotes?: string;
  failureReason?: ExecutionFailureReason;
  failureDetail?: string;
  timeline: TimelineEntry[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateExecutionJobProps = Pick<
  ExecutionJobProps,
  | 'orderId'
  | 'sagaId'
  | 'orderNumber'
  | 'vehiclePlate'
  | 'priority'
  | 'services'
  | 'parts'
>;

export const ACTIVE_STATUSES = [
  ExecutionJobStatus.QUEUED,
  ExecutionJobStatus.DIAGNOSING,
  ExecutionJobStatus.REPAIRING,
];

export class ExecutionJobEntity {
  private readonly props: ExecutionJobProps;
  private readonly _id: string;

  private constructor(props: ExecutionJobProps, id?: string) {
    this.props = props;
    this._id = id ?? '';
  }

  static create(
    props: CreateExecutionJobProps,
    id?: string,
  ): ExecutionJobEntity {
    ExecutionJobEntity.validate(props);
    const now = new Date();
    return new ExecutionJobEntity(
      {
        ...props,
        status: ExecutionJobStatus.QUEUED,
        timeline: [
          { status: ExecutionJobStatus.QUEUED, at: now, by: SYSTEM_ACTOR },
        ],
        version: 0,
        createdAt: now,
        updatedAt: now,
      },
      id,
    );
  }

  static reconstitute(
    props: ExecutionJobProps,
    id?: string,
  ): ExecutionJobEntity {
    return new ExecutionJobEntity(props, id);
  }

  startDiagnosis(mechanicId: string): void {
    this.moveTo(
      ExecutionJobStatus.DIAGNOSING,
      [ExecutionJobStatus.QUEUED],
      mechanicId,
    );
    this.props.mechanicId = mechanicId;
  }

  startRepair(mechanicId: string, diagnosisNotes?: string): void {
    this.moveTo(
      ExecutionJobStatus.REPAIRING,
      [ExecutionJobStatus.DIAGNOSING],
      mechanicId,
      diagnosisNotes,
    );
    if (diagnosisNotes) {
      this.props.diagnosisNotes = diagnosisNotes;
    }
  }

  finish(mechanicId: string, note?: string): void {
    this.moveTo(
      ExecutionJobStatus.DONE,
      [ExecutionJobStatus.REPAIRING],
      mechanicId,
      note,
    );
  }

  fail(
    mechanicId: string,
    reason: ExecutionFailureReason,
    detail: string,
  ): void {
    this.moveTo(ExecutionJobStatus.FAILED, ACTIVE_STATUSES, mechanicId, detail);
    this.props.failureReason = reason;
    this.props.failureDetail = detail;
  }

  /** Compensação da saga: repetir não muda nada, e um job já encerrado continua como está. */
  cancel(reason: string): boolean {
    if (!ACTIVE_STATUSES.includes(this.props.status)) {
      return false;
    }
    this.record(ExecutionJobStatus.CANCELED, SYSTEM_ACTOR, reason);
    return true;
  }

  get startedAt(): Date | undefined {
    return this.timelineAt(ExecutionJobStatus.DIAGNOSING);
  }

  get completedAt(): Date | undefined {
    return this.timelineAt(ExecutionJobStatus.DONE);
  }

  get canceledAt(): Date | undefined {
    return this.timelineAt(ExecutionJobStatus.CANCELED);
  }

  get failedAt(): Date | undefined {
    return this.timelineAt(ExecutionJobStatus.FAILED);
  }

  get durationSeconds(): number | undefined {
    const { startedAt, completedAt } = this;
    if (!startedAt || !completedAt) {
      return undefined;
    }
    return Math.round((completedAt.getTime() - startedAt.getTime()) / 1000);
  }

  private moveTo(
    to: ExecutionJobStatus,
    allowedFrom: ExecutionJobStatus[],
    by: string,
    note?: string,
  ): void {
    if (!allowedFrom.includes(this.props.status)) {
      throw new InvalidStatusTransitionException(this.props.status, to);
    }
    this.record(to, by, note);
  }

  private record(status: ExecutionJobStatus, by: string, note?: string): void {
    const at = new Date();
    this.props.status = status;
    this.props.timeline.push(
      note ? { status, at, by, note } : { status, at, by },
    );
    this.props.updatedAt = at;
  }

  private timelineAt(status: ExecutionJobStatus): Date | undefined {
    return this.props.timeline.find((entry) => entry.status === status)?.at;
  }

  private static validate(props: CreateExecutionJobProps): void {
    const required = [
      props.orderId,
      props.sagaId,
      props.orderNumber,
      props.vehiclePlate,
    ];
    if (required.some((value) => !value?.trim())) {
      throw new BusinessRuleException(
        'orderId, sagaId, orderNumber and vehiclePlate are required',
      );
    }
    if (!Object.values(ExecutionPriority).includes(props.priority)) {
      throw new BusinessRuleException(`Invalid priority "${props.priority}"`);
    }
    const items = [...props.services, ...props.parts];
    if (items.length === 0) {
      throw new BusinessRuleException(
        'An execution job needs at least one service or part',
      );
    }
    if (
      items.some(
        (item) =>
          !item.name?.trim() ||
          !Number.isInteger(item.quantity) ||
          item.quantity < 1,
      )
    ) {
      throw new BusinessRuleException(
        'Every item needs a name and a positive integer quantity',
      );
    }
  }

  get id(): string {
    return this._id;
  }
  get orderId(): string {
    return this.props.orderId;
  }
  get sagaId(): string {
    return this.props.sagaId;
  }
  get orderNumber(): string {
    return this.props.orderNumber;
  }
  get vehiclePlate(): string {
    return this.props.vehiclePlate;
  }
  get status(): ExecutionJobStatus {
    return this.props.status;
  }
  get priority(): ExecutionPriority {
    return this.props.priority;
  }
  get services(): WorkItem[] {
    return this.props.services;
  }
  get parts(): WorkItem[] {
    return this.props.parts;
  }
  get mechanicId(): string | undefined {
    return this.props.mechanicId;
  }
  get diagnosisNotes(): string | undefined {
    return this.props.diagnosisNotes;
  }
  get failureReason(): ExecutionFailureReason | undefined {
    return this.props.failureReason;
  }
  get failureDetail(): string | undefined {
    return this.props.failureDetail;
  }
  get timeline(): TimelineEntry[] {
    return this.props.timeline;
  }
  get version(): number {
    return this.props.version;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
