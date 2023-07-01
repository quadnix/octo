import { IModel } from '../../models/model.interface';

export enum DiffAction {
  ADD = 'add',
  DELETE = 'delete',
  UPDATE = 'update',
}

export class Diff {
  readonly action: DiffAction;

  readonly field: string;

  readonly model: IModel<unknown, unknown>;

  readonly value: unknown;

  constructor(model: Diff['model'], action: Diff['action'], field: Diff['field'], value: Diff['value']) {
    this.model = model;
    this.action = action;
    this.field = field;
    this.value = value;
  }

  toJSON(): { action: Diff['action']; context: string; field: Diff['field']; value: Diff['value'] } {
    return {
      action: this.action,
      context: this.model.getContext(),
      field: this.field,
      value: this.value,
    };
  }
}