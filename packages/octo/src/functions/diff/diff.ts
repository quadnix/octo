import type { UnknownAnchor, UnknownNode } from '../../app.type.js';

export enum DiffAction {
  ADD = 'add',
  DELETE = 'delete',
  REPLACE = 'replace',
  UPDATE = 'update',
}

export class Diff {
  readonly action: DiffAction;

  readonly field: string;

  readonly node: UnknownNode;

  readonly value: unknown;

  constructor(node: Diff['node'], action: Diff['action'], field: Diff['field'], value: Diff['value']) {
    this.node = node;
    this.action = action;
    this.field = field;
    this.value = value;
  }

  /**
   * Overrides JSON.serialize() to output a more succinct representation of diff.
   */
  toJSON(): { action: string; field: string; node: string; value: unknown } {
    let value = this.value;
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
