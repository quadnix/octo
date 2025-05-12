import type { Constructable } from '../app.type.js';

export class ContainerError extends Error {
  readonly type: string;

  constructor(message: string, type: Constructable<unknown> | string) {
    super(message);

    this.type = typeof type === 'string' ? type : type.name;

    Object.setPrototypeOf(this, ContainerError.prototype);
  }
}

export class ContainerRegistrationError extends ContainerError {
  constructor(message: string, type: Constructable<unknown> | string) {
    super(message, type);

    Object.setPrototypeOf(this, ContainerRegistrationError.prototype);
  }
}

export class ContainerResolutionError extends ContainerError {
  constructor(message: string, type: Constructable<unknown> | string) {
    super(message, type);

    Object.setPrototypeOf(this, ContainerResolutionError.prototype);
  }
}
