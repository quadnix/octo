import { Diff } from '../functions/diff/diff.model';

export interface IResourceAction {
  readonly ACTION_NAME: string;

  filter(diff: Diff): boolean;

  handle(diff: Diff): Promise<void>;
}
