import type { UnknownAnchor, UnknownNode } from '../../app.type.js';

/**
 * What a {@link Diff} says happened to a node.
 *
 * `REPLACE` is distinct from `UPDATE`: it means the change cannot be applied in place, and the
 * infrastructure must be destroyed and re-created.
 *
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
 * One change to one field of one node.
 *
 * Diffs are the currency of Octo: comparing the graph you just described against the last committed
 * one produces a list of them, and every action is selected and driven by the diffs it accepts.
 *
 * @group Functions/Diff
 */
export class Diff<N extends UnknownNode = UnknownNode, V = unknown> {
  /**
   * What happened.
   */
  readonly action: DiffAction;

  /**
   * The field of the node that changed, e.g. `resourceId`, `properties`, or `parent`.
   */
  readonly field: string;

  /**
   * The node that changed.
   */
  readonly node: N;

  /**
   * Why the change is being made, when the field alone does not explain it.
   * It is carried into reports, so write it for whoever reads the plan.
   */
  readonly reason?: string;

  /**
   * The new value of the field. Its shape depends on the field.
   */
  readonly value: V;

  /**
   * @param node The node that changed.
   * @param action What happened to it.
   * @param field The field of the node that changed.
   * @param value The new value of the field.
   * @param reason Why the change is being made, carried into reports.
   */
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
   *
   * @internal
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
