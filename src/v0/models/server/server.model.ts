import { Diff } from '../../utility/diff.utility';
import { IModel } from '../model.interface';

export class Server implements IModel<Server> {
  readonly serverKey: string;

  constructor(serverKey: string) {
    this.serverKey = serverKey;
  }

  clone(): Server {
    return new Server(this.serverKey);
  }

  diff(latest: Server): Diff[] {
    return [];
  }
}
