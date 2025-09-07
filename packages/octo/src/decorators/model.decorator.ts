import { type Constructable, type ModelSchema, NodeType, type UnknownModel } from '../app.type.js';
import { Container } from '../functions/container/container.js';
import { AModel } from '../models/model.abstract.js';
import { AOverlay } from '../overlays/overlay.abstract.js';
import { ModelSerializationService } from '../services/serialization/model/model-serialization.service.js';
import { ValidationUtility } from '../utilities/validation/validation.utility.js';

/**
 * A `@Model` is a class decorator and must be placed on top of a class representing a model.
 * - A model must also extend a base model class.
 * - For type safety, the type of model being decorated is passed to the decorator.
 *
 * @example
 * ```ts
 * @Model<MyModel>('@example', 'region', MyModelSchema)
 * export class MyModel extends Region { ... }
 * ```
 *
 * @group Decorators
 *
 * @param packageName - The name of the package under which the model is registered.
 * Selecting a unique package name helps avoid collisions between same model class names across different libraries.
 * You will reuse the same package name throughout your library for different Octo components you create.
 * @param modelName - a string that uniquely represents the base model you are extending.
 * Octo provides names for each of the base models, and you must use the same name.
 * E.g. for region base model, the model name is `region`.
 * @param schema - The schema of the model.
 *
 * @returns The decorated class.
 *
 * @see Definition of [Models](/docs/fundamentals/models).
 * @see {@link App} and {@link Region} are a few base models. More can be found in the same folder.
 */
export function Model<T extends UnknownModel>(
  packageName: string,
  modelName: string,
  schema: Constructable<ModelSchema<T>>,
): (constructor: any) => void {
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
    constructor.NODE_SCHEMA = schema;
    constructor.NODE_TYPE = NodeType.MODEL;

    const promise = container.get(ModelSerializationService).then((modelSerializationService) => {
      modelSerializationService.registerClass(`${packageName}/${constructor.name}`, constructor);
    });
    container.registerStartupUnhandledPromise(promise);
  };
}
