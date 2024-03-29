import { Diff } from '../functions/diff/diff.model.js';

export interface IResourceAction {
  readonly ACTION_NAME: string;

  filter(diff: Diff): boolean;

  handle(diff: Diff): Promise<void>;
}
