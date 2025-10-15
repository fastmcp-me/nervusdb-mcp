export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly isOperational: boolean;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      isOperational: this.isOperational,
    };
  }
}

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_ERROR';
  readonly isOperational = true;

  constructor(
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      details: this.details,
    };
  }
}

export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
  readonly isOperational = true;

  constructor(resource: string, identifier?: string) {
    super(identifier ? `${resource} not found: ${identifier}` : `${resource} not found`);
  }
}

export class ConflictError extends DomainError {
  readonly code = 'CONFLICT';
  readonly isOperational = true;

  constructor(message: string) {
    super(message);
  }
}

export class InternalError extends DomainError {
  readonly code = 'INTERNAL_ERROR';
  readonly isOperational = false;

  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      cause: this.cause?.message,
    };
  }
}
