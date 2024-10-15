import type { Diff } from '../functions/diff/diff.js';

export interface IResourceAction {
  filter(diff: Diff): boolean;

  handle(diff: Diff): Promise<void>;

  mock(capture?: object, diff?: Diff): Promise<void>;
}
