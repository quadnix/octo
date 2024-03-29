import { IServer, Image, Model, Server, UnknownModel } from '@quadnix/octo';
import { IamUserAnchor } from '../../anchors/iam-user.anchor.model.js';

@Model()
export class AwsServer extends Server {
  constructor(serverKey: string, image: Image) {
    super(serverKey, image);

    const serverIamUserName = `${serverKey.charAt(0).toUpperCase() + serverKey.slice(1)}ServiceUser`;
    this.anchors.push(new IamUserAnchor(serverIamUserName, this));
  }

  override synth(): IServer {
    return {
      image: { context: this.image.getContext() },
      serverKey: this.serverKey,
    };
  }

  static override async unSynth(
    awsServer: IServer,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<AwsServer> {
    const image = (await deReferenceContext(awsServer.image.context)) as Image;
    return new AwsServer(awsServer.serverKey, image);
  }
}
