import { Model } from '../../models/model.abstract';

export interface IAnchor {
  name: Anchor['ANCHOR_NAME'];
  parent: string;
}

export abstract class Anchor {
  abstract readonly ANCHOR_NAME: string;

  protected constructor(private readonly parent: Model<unknown, unknown>) {
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
}
