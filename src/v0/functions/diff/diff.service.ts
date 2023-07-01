import { Diff } from './diff.model';

type IAction = { filter: (diff: Diff) => boolean; handle: (diff: Diff) => Promise<void> };

export class DiffService {
  private readonly actions: IAction[] = [];

  registerAction(filter: IAction['filter'], handle: IAction['handle']): void {
    this.actions.push({
      filter,
      handle,
    });
  }

  async apply(diff: Diff): Promise<void> {
    const handles: Promise<void>[] = [];

    for (const action of this.actions) {
      if (action.filter(diff)) {
        handles.push(action.handle(diff));
      }
    }

    if (handles.length === 0) {
      throw new Error('No action found!');
    }
    await Promise.all(handles);
  }
}
