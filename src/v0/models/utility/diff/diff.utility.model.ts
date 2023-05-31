export enum DiffAction {
  ADD = 'add',
  DELETE = 'delete',
  UPDATE = 'update',
}

export class Diff {
  readonly action: DiffAction;

  readonly context: string;

  readonly field: string;

  readonly value: unknown;

  constructor(action: DiffAction, context: string, field: string, value: unknown) {
    this.action = action;
    this.context = context;
    this.field = field;
    this.value = value;
  }
}
