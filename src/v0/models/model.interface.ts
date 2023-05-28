import { Diff } from '../utility/diff.utility';

export interface IModel<T> {
  clone(): T;

  diff(latest: T): Diff[];

  getContext(): string;
}
