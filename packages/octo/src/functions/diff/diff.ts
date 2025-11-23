import type { UnknownAnchor, UnknownNode } from '../../app.type.js';

/**
 * @group Functions/Diff
 */
export enum DiffAction {
  ADD = 'add',
  DELETE = 'delete',
  REPLACE = 'replace',
  UPDATE = 'update',
  VALIDATE = 'validate',
}

/**
 * @group Functions/Diff
 */
export class Diff<N extends UnknownNode = UnknownNode, V = unknown> {
  readonly action: DiffAction;

  readonly field: string;

  readonly node: N;

  readonly value: V;

  constructor(node: Diff<N, V>['node'], action: Diff['action'], field: Diff['field'], value: Diff<N, V>['value']) {
    this.node = node;
    this.action = action;
    this.field = field;
    this.value = value;
  }

  /**
   * Overrides JSON.serialize() to output a more succinct representation of diff.
   */
  toJSON(): { action: string; field: string; node: string; value: V | string } {
    let value: V | string = this.value;
    if ((value as UnknownNode).getContext) {
      value = (value as UnknownNode).getContext();
    } else if ((value as UnknownAnchor).anchorId) {
      value = `anchorId=${(value as UnknownAnchor).anchorId}`;
    } else {
      value = JSON.parse(JSON.stringify(value));
    }

    return {
      action: this.action,
      field: this.field,
      node: this.node.getContext(),
      value,
    };
  }
}
