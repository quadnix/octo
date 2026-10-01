import { Model, Server } from '@quadnix/octo';
import { AwsServerSchema } from './aws-server.schema.js';

/**
 * @internal
 */
@Model<AwsServer>('@octo', 'server', AwsServerSchema)
export class AwsServer extends Server {
  /**
   * @internal
   */
  static override async unSynth(server: AwsServerSchema): Promise<AwsServer> {
    return new AwsServer(server.serverKey);
  }
}
