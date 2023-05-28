import { Diff } from '../../utility/diff.utility';
import { App } from '../app/app.model';
import { IModel } from '../model.interface';

export class Support implements IModel<Support> {
  readonly context: App;

  readonly serverKey: string;

  constructor(context: App, serverKey: string) {
    this.context = context;
    this.serverKey = serverKey;
  }

  clone(): Support {
    return new Support(this.context, this.serverKey);
  }

  diff(latest: Support): Diff[] {
    return [];
  }

  getContext(): string {
    return [`support=${this.serverKey}`, this.context.getContext()].join(',');
  }
}
