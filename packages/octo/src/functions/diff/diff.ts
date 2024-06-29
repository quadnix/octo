import type { UnknownModel } from '../../app.type.js';
import { AModel } from '../../models/model.abstract.js';
import { AAnchor } from '../../overlays/anchor.abstract.js';

export enum DiffAction {
  ADD = 'add',
  DELETE = 'delete',
  REPLACE = 'replace',
  UPDATE = 'update',
}

export class Diff {
  readonly action: DiffAction;

  readonly field: string;

  readonly model: UnknownModel;

  readonly value: unknown;

  constructor(model: Diff['model'], action: Diff['action'], field: Diff['field'], value: Diff['value']) {
    this.model = model;
    this.action = action;
    this.field = field;
    this.value = value;
  }

  /**
   * Overrides JSON.serialize() to output a more succinct model of diff.
   */
  toJSON(): object {
    let model: unknown = this.model;
    if (model instanceof AModel) {
      model = model.getContext();
    }

    let value = this.value;
    if (value instanceof AModel) {
      value = value.getContext();
    } else if (value instanceof AAnchor) {
      value = `anchorId=${value.anchorId}`;
    }

    return {
      action: this.action,
      field: this.field,
      model,
      value,
    };
  }
}
