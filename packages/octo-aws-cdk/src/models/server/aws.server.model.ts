import { Model, Server } from '@quadnix/octo';
import { IamUserAnchor } from '../../anchors/iam-user.anchor.model';
import { AwsRegion } from '../region/aws.region.model';
import { IAwsServer } from './aws.server.interface';

export class AwsServer extends Server {
  readonly region: AwsRegion;

  constructor(region: AwsRegion, serverKey: string) {
    super(serverKey);

    this.region = region;

    const serverIamUserName = `${serverKey.charAt(0).toUpperCase() + serverKey.slice(1)}ServiceUser`;
    this.anchors.push(new IamUserAnchor(serverIamUserName, this));
  }

  override synth(): IAwsServer {
    return {
      region: { context: this.region.getContext() },
      serverKey: this.serverKey,
    };
  }

  static override async unSynth(
    awsServer: IAwsServer,
    deReferenceContext?: (context: string) => Promise<Model<unknown, unknown>>,
  ): Promise<AwsServer> {
    // Marking deReferenceContext optional to satisfy super class's unSynth definition.
    if (!deReferenceContext) {
      throw new Error('No deReferenceContext passed during un-synth');
    }

    const region = (await deReferenceContext(awsServer.region.context)) as AwsRegion;
    return new AwsServer(region, awsServer.serverKey);
  }
}
