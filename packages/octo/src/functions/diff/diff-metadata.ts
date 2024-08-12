import type { ActionInputs, ActionOutputs, UnknownNode } from '../../app.type.js';
import type { IModelAction } from '../../models/model-action.interface.js';
import type { IResourceAction } from '../../resources/resource-action.interface.js';
import type { Diff, DiffAction } from './diff.js';

export class DiffMetadata {
  readonly actions: IModelAction[] | IResourceAction[];
  applied: boolean;
  applyOrder: number;

  readonly diff: Diff;
  readonly action: DiffAction;
  readonly field: string;
  readonly node: UnknownNode;
  readonly value: unknown;

  readonly inputs: ActionInputs = {};
  readonly outputs: ActionOutputs = {};

  constructor(diff: Diff, actions: IModelAction[] | IResourceAction[]) {
    if (!actions?.length) {
      throw new Error('No matching action given for diff!');
    }

    this.actions = actions;
    this.applied = false;
    this.applyOrder = -1;

    this.diff = diff;
    this.action = diff.action;
    this.field = diff.field;
    this.node = diff.node;
    this.value = diff.value;
  }

  /**
   * Overrides JSON.serialize() to output a more succinct model of diff-metadata.
   */
  toJSON(): ReturnType<Diff['toJSON']> {
    return this.diff.toJSON();
  }

  updateInputs(inputs: ActionInputs): void {
    Object.assign(this.inputs, inputs);
  }

  updateOutputs(outputs: ActionOutputs): void {
    Object.assign(this.outputs, outputs);
  }
}
