import type { Constructable } from '../app.type.js';

/**
 * Parent error class for all {@link Container} errors.
 *
 * @group Errors/Container
 */
export class ContainerError extends Error {
  readonly type: string;

  /**
   * @param message The error message.
   * @param type The class the container was resolving or registering.
   */
  constructor(message: string, type: Constructable<unknown> | string) {
    super(message);

    this.type = typeof type === 'string' ? type : type.name;

    Object.setPrototypeOf(this, ContainerError.prototype);
  }
}

/**
 * Thrown when a factory is registered for a class that already has one with the same metadata.
 *
 * @group Errors/Container
 */
export class ContainerRegistrationError extends ContainerError {
  /**
   * @param message The error message.
   * @param type The class whose factory was being registered.
   */
  constructor(message: string, type: Constructable<unknown> | string) {
    super(message, type);

    Object.setPrototypeOf(this, ContainerRegistrationError.prototype);
  }
}

/**
 * Thrown when a class is requested and no factory registers for it before the timeout - see {@link Container.setFactoryTimeout}.
 *
 * @group Errors/Container
 */
export class ContainerResolutionError extends ContainerError {
  /**
   * @param message The error message.
   * @param type The class that could not be resolved.
   */
  constructor(message: string, type: Constructable<unknown> | string) {
    super(message, type);

    Object.setPrototypeOf(this, ContainerResolutionError.prototype);
  }
}
