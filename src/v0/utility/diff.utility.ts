export enum DiffAction {
  ADD = 'add',
  DELETE = 'delete',
  UPDATE = 'update',
}

export class Diff {
  readonly action: DiffAction;

  readonly field: string;

  readonly value: unknown;

  constructor(action: DiffAction, field: string, value: unknown) {
    this.action = action;
    this.field = field;
    this.value = value;
  }
}
