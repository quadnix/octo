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

  readonly reason?: string;

  readonly value: V;

  constructor(
    node: Diff<N, V>['node'],
    action: Diff['action'],
    field: Diff['field'],
    value: Diff<N, V>['value'],
    reason?: Diff['reason'],
  ) {
    this.node = node;
    this.action = action;
    this.field = field;
    this.value = value;
    this.reason = reason;
  }

  /**
   * Overrides JSON.serialize() to output a more succinct representation of diff.
   */
  toJSON(): { action: string; field: string; node: string; reason?: string; value: V | string } {
    let value: V | string = this.value;
    if ((value as UnknownNode).getContext) {
      value = (value as UnknownNode).getContext();
    } else if ((value as UnknownAnchor).anchorId) {
      value = `anchorId=${(value as UnknownAnchor).anchorId}`;
    } else {
      value = value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    }

    const json: { action: string; field: string; node: string; reason?: string; value: V | string } = {
      action: this.action,
      field: this.field,
      node: this.node.getContext(),
      value,
    };

    if (this.reason !== undefined) {
      json.reason = this.reason;
    }

    return json;
  }
}
