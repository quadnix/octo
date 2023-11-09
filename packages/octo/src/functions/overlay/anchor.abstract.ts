import { UnknownModel } from '../../app.type.js';
import { IAnchor } from './anchor.interface.js';

export abstract class AAnchor {
  abstract readonly ANCHOR_NAME: string;

  protected constructor(private readonly parent: UnknownModel) {
    if (parent['anchors'].find((a) => a.ANCHOR_NAME === this.ANCHOR_NAME)) {
      throw new Error('Anchor already exists!');
    }
  }

  synth(): IAnchor {
    return {
      name: this.ANCHOR_NAME,
      parent: this.parent.getContext(),
    };
  }

  static async unSynth(...args: unknown[]): Promise<AAnchor> {
    if (args.length > 2) {
      throw new Error('Too many args in unSynth()');
    }

    throw new Error('Method not implemented! Use derived class implementation');
  }
}