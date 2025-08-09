import { Model, Server } from '@quadnix/octo';
import { AwsEcsServerSchema } from './aws-ecs-server.schema.js';

/**
 * @internal
 */
@Model<AwsEcsServer>('@octo', 'server', AwsEcsServerSchema)
export class AwsEcsServer extends Server {
  static override async unSynth(server: AwsEcsServerSchema): Promise<AwsEcsServer> {
    return new AwsEcsServer(server.serverKey);
  }
}
