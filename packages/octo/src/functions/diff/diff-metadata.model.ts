import { IAction, IActionInputs, IActionOutputs } from '../../models/action.interface';
import { Model } from '../../models/model.abstract';
import { IResourceAction } from '../../resources/resource-action.interface';
import { Resource } from '../../resources/resource.abstract';
import { Diff, DiffAction } from './diff.model';

export class DiffMetadata {
  readonly actions: IAction<IActionInputs, IActionOutputs>[] | IResourceAction[];
  applied: boolean;
  applyOrder: number;

  readonly diff: Diff;
  readonly action: DiffAction;
  readonly field: string;
  readonly model: Model<unknown, unknown> | Resource<unknown>;
  readonly value: unknown;

  readonly inputs: IActionInputs = {};
  readonly outputs: IActionOutputs = {};

  constructor(diff: Diff, actions: IAction<IActionInputs, IActionOutputs>[] | IResourceAction[]) {
    if (!actions?.length) {
      throw new Error('No matching action given for diff!');
    }

    this.actions = actions;
    this.applied = false;
    this.applyOrder = -1;

    this.diff = diff;
    this.action = diff.action;
    this.field = diff.field;
    this.model = diff.model;
    this.value = diff.value;
  }

  toJSON(): ReturnType<Diff['toJSON']> {
    return {
      action: this.action,
      field: this.field,
      value: this.value,
    };
  }

  updateInputs(inputs: IActionInputs): void {
    Object.assign(this.inputs, inputs);
  }

  updateOutputs(outputs: IActionOutputs): void {
    Object.assign(this.outputs, outputs);
  }
}
