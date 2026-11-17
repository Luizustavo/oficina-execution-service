export class DomainException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainException';
  }
}

export class InvalidStatusTransitionException extends DomainException {
  constructor(from: string, to: string) {
    super(`Invalid status transition from ${from} to ${to}`);
    this.name = 'InvalidStatusTransitionException';
  }
}

export class NotFoundException extends DomainException {
  constructor(entity: string, id: string) {
    super(`${entity} with id "${id}" not found`);
    this.name = 'NotFoundException';
  }
}

export class ConflictException extends DomainException {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictException';
  }
}

export class BusinessRuleException extends DomainException {
  constructor(message: string) {
    super(message);
    this.name = 'BusinessRuleException';
  }
}

export class InvalidMessageException extends DomainException {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMessageException';
  }
}

export class ConcurrentModificationException extends ConflictException {
  constructor(entity: string, id: string) {
    super(`${entity} "${id}" was changed by another request, try again`);
    this.name = 'ConcurrentModificationException';
  }
}
