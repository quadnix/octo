import { DiffMetadata } from '../diff/diff-metadata.js';
import { AHook } from './hook.abstract.js';

export type PostModelTransactionCallback = (modelTransaction: DiffMetadata[][]) => Promise<void>;

export class PostModelTransactionHandleHook extends AHook {
  private static readonly callbacks: PostModelTransactionCallback[] = [];

  static async apply(modelTransaction: DiffMetadata[][]): Promise<void> {
    for (const callback of this.callbacks) {
      await callback(modelTransaction);
    }
  }

  static register(callback: PostModelTransactionCallback): PostModelTransactionHandleHook {
    this.callbacks.push(callback);
    return this;
  }
}
