import { Diff } from '../../utility/diff.utility';
import { IModel } from '../model.interface';

export class Support implements IModel<Support> {
  readonly serverKey: string;

  constructor(serverKey: string) {
    this.serverKey = serverKey;
  }

  clone(): Support {
    return new Support(this.serverKey);
  }

  diff(latest: Support): Diff[] {
    return [];
  }
}
