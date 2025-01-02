import { Model, Server } from '@quadnix/octo';
import { AwsServerSchema } from './aws.server.schema.js';

@Model<AwsServer>('@octo', 'server', AwsServerSchema)
export class AwsServer extends Server {
  static override async unSynth(awsServer: AwsServerSchema): Promise<AwsServer> {
    return new AwsServer(awsServer.serverKey);
  }
}
