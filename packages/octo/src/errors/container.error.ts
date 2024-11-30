import type { Constructable } from '../app.type.js';

export class ContainerError extends Error {
  constructor(message: string) {
    super(message);

    Object.setPrototypeOf(this, ContainerError.prototype);
  }
}

export class ContainerRegistrationError extends ContainerError {
  readonly type: string;

  constructor(message: string, type: Constructable<unknown> | string) {
    super(message);

    this.type = typeof type === 'string' ? type : type.name;

    Object.setPrototypeOf(this, ContainerRegistrationError.prototype);
  }
}

export class ContainerResolutionError extends ContainerError {
  readonly type: string;

  constructor(message: string, type: Constructable<unknown> | string) {
    super(message);

    this.type = typeof type === 'string' ? type : type.name;

    Object.setPrototypeOf(this, ContainerResolutionError.prototype);
  }
}
