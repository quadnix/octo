import { Diff } from './diff.model';

type IHandler = { filter: (diff: Diff) => boolean; handle: () => Promise<void> };

export class DiffService {
  private readonly handlers: IHandler[] = [];

  registerHandler(filter: IHandler['filter'], handle: IHandler['handle']): void {
    this.handlers.push({
      filter,
      handle,
    });
  }

  async apply(diff: Diff): Promise<void> {
    const handles: Promise<void>[] = [];

    for (const handler of this.handlers) {
      if (handler.filter(diff)) {
        handles.push(handler.handle());
      }
    }

    if (handles.length === 0) {
      throw new Error('No handle found!');
    }
    await Promise.all(handles);
  }
}
