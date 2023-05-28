import { Diff } from '../../utility/diff.utility';
import { App } from '../app/app.model';
import { IModel } from '../model.interface';

export class Server implements IModel<Server> {
  readonly context: App;

  readonly serverKey: string;

  constructor(context: App, serverKey: string) {
    this.context = context;
    this.serverKey = serverKey;
  }

  clone(): Server {
    return new Server(this.context, this.serverKey);
  }

  diff(latest: Server): Diff[] {
    return [];
  }

  getContext(): string {
    return [`server=${this.serverKey}`, this.context.getContext()].join(',');
  }
}
