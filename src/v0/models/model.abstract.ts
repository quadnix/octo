import { Diff, DiffAction } from '../functions/diff/diff.model';
import { HookService } from '../functions/hook/hook.service';
import { IModel } from './model.interface';

/**
 * This is the first implementation of the Model's interface,
 * and is used to define common functionality between all models.
 * All models are an extension of this class.
 */
export abstract class Model<I, T> implements IModel<I, T> {
  abstract readonly MODEL_NAME: string;

  readonly dependencies: {
    [key in keyof I]?: { [key in DiffAction]?: [Model<unknown, unknown>, string, DiffAction][] };
  } = {};

  readonly hookService: HookService;

  protected constructor() {
    this.hookService = HookService.getInstance();
  }

  /**
   * See the field definition of "dependencies" for more details.
   * This function adds a dependency between a field in self model, and another model's field.
   * The method is idempotent, i.e. the dependency is only added if it does not already exists.
   */
  addDependency(
    onField: keyof I,
    onAction: DiffAction,
    toModel: Model<unknown, unknown>,
    toField: string,
    forAction: DiffAction,
  ): void {
    if (!toModel.hasOwnProperty(toField)) {
      throw new Error('Invalid field name is not a property of this model!');
    }

    if (!this.dependencies[onField]) {
      this.dependencies[onField] = {};
    }
    if (!this.dependencies[onField]![onAction]) {
      this.dependencies[onField]![onAction] = [];
    }

    const dependencies = this.dependencies[onField]![onAction];
    const exists = dependencies!.some((d) => {
      const [model, field, action] = d;
      return model.MODEL_NAME === toModel.MODEL_NAME && model[field] === toModel[toField] && action === forAction;
    });
    if (!exists) {
      dependencies!.push([toModel, toField, forAction]);
    }
  }

  abstract clone(): T;

  abstract diff(previous?: T): Diff[];

  abstract isEqual(instance: T): boolean;

  abstract synth(): I;
}
