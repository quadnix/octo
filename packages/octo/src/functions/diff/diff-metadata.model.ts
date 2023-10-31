import { ActionInputs, ActionOutputs, UnknownModel, UnknownResource } from '../../app.type.js';
import { IAction } from '../../models/action.interface.js';
import { IResourceAction } from '../../resources/resource-action.interface.js';
import { Diff, DiffAction } from './diff.model.js';

export class DiffMetadata {
  readonly actions: IAction<ActionInputs, ActionOutputs>[] | IResourceAction[];
  applied: boolean;
  applyOrder: number;

  readonly diff: Diff;
  readonly action: DiffAction;
  readonly field: string;
  readonly model: UnknownModel | UnknownResource;
  readonly value: unknown;

  readonly inputs: ActionInputs = {};
  readonly outputs: ActionOutputs = {};

  constructor(diff: Diff, actions: IAction<ActionInputs, ActionOutputs>[] | IResourceAction[]) {
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

  updateInputs(inputs: ActionInputs): void {
    Object.assign(this.inputs, inputs);
  }

  updateOutputs(outputs: ActionOutputs): void {
    Object.assign(this.outputs, outputs);
  }
}
