import { Diff, DiffAction } from '../functions/diff/diff.model';
import { IModel } from './model.interface';

export abstract class Model<I, T> implements IModel<I, T> {
  abstract readonly MODEL_NAME: string;

  readonly dependencies: {
    [key in keyof I]?: { [key in DiffAction]?: [Model<unknown, unknown>, string, DiffAction][] };
  } = {};

  abstract clone(): T;

  abstract diff(previous?: T): Diff[];

  addDependency(
    onProperty: keyof I,
    onAction: DiffAction,
    toModel: Model<unknown, unknown>,
    toProperty: string,
    forAction: DiffAction,
  ): void {
    if (!this.dependencies[onProperty]) {
      this.dependencies[onProperty] = {};
    }
    if (!this.dependencies[onProperty]![onAction]) {
      this.dependencies[onProperty]![onAction] = [];
    }

    const dependencies = this.dependencies[onProperty]![onAction];
    const exists = dependencies!.some((d) => {
      const [model, property, action] = d;
      return model.MODEL_NAME === toModel.MODEL_NAME && model[property] === toModel[toProperty] && action === forAction;
    });
    if (!exists) {
      dependencies!.push([toModel, toProperty, forAction]);
    }
  }

  abstract synth(): I;
}
