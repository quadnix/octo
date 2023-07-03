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
    onField: keyof I,
    onAction: DiffAction,
    toModel: Model<unknown, unknown>,
    toField: string,
    forAction: DiffAction,
  ): void {
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

  abstract synth(): I;
}
