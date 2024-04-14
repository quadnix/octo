import { Constructable } from '../../app.type.js';
import { App } from '../../models/app/app.model.js';
import { DiffMetadata } from '../diff/diff-metadata.js';
import { AHook } from './hook.abstract.js';

export type PreCommitCallback = (modelTransaction: DiffMetadata[][]) => Promise<void>;
type PreCommitMethodSignature = (app: App, modelTransaction: DiffMetadata[][]) => Promise<void>;

export class PreCommitHandleHook extends AHook {
  private static readonly callbacks: PreCommitCallback[] = [];

  static register(callback: PreCommitCallback): PreCommitHandleHook {
    this.callbacks.push(callback);
    return this;
  }

  static override registrar(
    constructor: Constructable<unknown>,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<PreCommitMethodSignature>,
  ): void {
    const originalMethod = descriptor.value;
    const self = this; // eslint-disable-line @typescript-eslint/no-this-alias

    // `self` here references PreCommitHandleHook, vs `this` references the original method.
    descriptor.value = async function (...args: [app: App, modelTransaction: DiffMetadata[][]]): Promise<void> {
      for (const callback of self.callbacks) {
        await callback(args[1]);
      }

      await originalMethod!.apply(this, args);
    };
  }
}
