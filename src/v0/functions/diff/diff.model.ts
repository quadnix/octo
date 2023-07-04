import { IAction } from '../../models/action.interface';
import { IModel } from '../../models/model.interface';

export enum DiffAction {
  ADD = 'add',
  DELETE = 'delete',
  UPDATE = 'update',
}

export class Diff {
  readonly action: DiffAction;

  readonly field: string;

  readonly metadata: {
    actions: IAction[];
    applied: boolean;
    applyOrder: number;
  };

  readonly model: IModel<unknown, unknown>;

  readonly value: unknown;

  constructor(model: Diff['model'], action: Diff['action'], field: Diff['field'], value: Diff['value']) {
    this.model = model;
    this.action = action;
    this.field = field;
    this.value = value;
    this.metadata = { actions: [], applied: false, applyOrder: -1 };
  }

  toJSON(): Omit<Diff, 'metadata' | 'model' | 'toJSON'> {
    return {
      action: this.action,
      field: this.field,
      value: this.value,
    };
  }
}
