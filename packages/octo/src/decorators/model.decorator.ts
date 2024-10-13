import { NodeType } from '../app.type.js';
import { AModel } from '../models/model.abstract.js';
import { AOverlay } from '../overlays/overlay.abstract.js';
import { ModelSerializationService } from '../services/serialization/model/model-serialization.service.js';
import { Container } from '../functions/container/container.js';
import { ValidationUtility } from '../utilities/validation/validation.utility.js';

/**
 * A `@Model` is a class decorator to be placed on top of a class that represents a model.
 * - A model must extend the {@link AModel} class.
 *
 * @example
 * ```ts
 * @Model('my-package', 'my-name')
 * export class MyModel extends AModel<IMyModel, MyModel> { ... }
 * ```
 * @group Decorators
 * @returns The decorated class.
 * @see Definition of [Models](/docs/fundamentals/models).
 */
export function Model(packageName: string, modelName: string): (constructor: any) => void {
  const container = Container.getInstance();

  return function (constructor: any) {
    if (!ValidationUtility.validateRegex(packageName, /^[@A-Za-z][\w-]+[A-Za-z]$/)) {
      throw new Error(`Invalid package name: ${packageName}`);
    }
    if (!ValidationUtility.validateRegex(modelName, /^[A-Za-z][\w-]+[A-Za-z]$/)) {
      throw new Error(`Invalid model name: ${modelName}`);
    }
    if (!(constructor.prototype instanceof AModel) || constructor.prototype instanceof AOverlay) {
      throw new Error(`Class "${constructor.name}" must extend the AModel class!`);
    }

    constructor.NODE_NAME = modelName;
    constructor.NODE_PACKAGE = packageName;
    constructor.NODE_TYPE = NodeType.MODEL;

    const promise = container.get(ModelSerializationService).then((modelSerializationService) => {
      modelSerializationService.registerClass(`${packageName}/${constructor.name}`, constructor);
    });
    container.registerStartupUnhandledPromise(promise);
  };
}
