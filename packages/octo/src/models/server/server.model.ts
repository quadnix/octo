import { Deployment } from '../deployment/deployment.model.js';
import { Image } from '../image/image.model.js';
import { Model } from '../model.abstract.js';
import { IServer } from './server.interface.js';

export class Server extends Model<IServer, Server> {
  readonly MODEL_NAME: string = 'server';

  readonly image: Image;

  readonly serverKey: string;

  constructor(serverKey: string, image: Image) {
    super();
    this.serverKey = serverKey;

    this.image = image;
    this.addRelationship('serverKey', image, 'imageId');
  }

  addDeployment(deployment: Deployment): void {
    const childrenDependencies = this.getChildren('deployment');
    if (!childrenDependencies['deployment']) childrenDependencies['deployment'] = [];

    // Check for duplicates.
    const deployments = childrenDependencies['deployment'].map((d) => d.to);
    if (deployments.find((d: Deployment) => d.deploymentTag === deployment.deploymentTag)) {
      throw new Error('Deployment already exists!');
    }
    this.addChild('serverKey', deployment, 'deploymentTag');
  }

  getContext(): string {
    const parents = this.getParents();
    const app = parents['app'][0].to;
    return [`${this.MODEL_NAME}=${this.serverKey}`, app.getContext()].join(',');
  }

  synth(): IServer {
    return {
      image: { context: this.image.getContext() },
      serverKey: this.serverKey,
    };
  }

  static override async unSynth(
    server: IServer,
    deReferenceContext: (context: string) => Promise<Model<unknown, unknown>>,
  ): Promise<Server> {
    const image = (await deReferenceContext(server.image.context)) as Image;
    return new Server(server.serverKey, image);
  }
}
