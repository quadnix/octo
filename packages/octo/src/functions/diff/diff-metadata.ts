import type {
  ActionInputs,
  ActionOutputs,
  IUnknownModelAction,
  IUnknownResourceAction,
  UnknownNode,
} from '../../app.type.js';
import { NoMatchingActionFoundTransactionError } from '../../errors/index.js';
import type { Diff, DiffAction } from './diff.js';

export class DiffMetadata {
  readonly actions: IUnknownModelAction[] | IUnknownResourceAction[];
  applied: boolean;
  applyOrder: number;

  readonly diff: Diff;
  readonly action: DiffAction;
  readonly field: string;
  readonly node: UnknownNode;
  readonly value: unknown;

  readonly inputs: ActionInputs = { inputs: {}, metadata: {}, models: {}, overlays: {}, resources: {} };
  readonly outputs: ActionOutputs = {};

  constructor(diff: Diff, actions: IUnknownModelAction[] | IUnknownResourceAction[]) {
    if (!actions?.length) {
      throw new NoMatchingActionFoundTransactionError('No matching action given for diff!', diff);
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
