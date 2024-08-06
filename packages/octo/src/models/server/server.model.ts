import type { UnknownModel } from '../../app.type.js';
import { Model } from '../../decorators/model.decorator.js';
import { Validate } from '../../decorators/validate.decorator.js';
import type { Diff } from '../../functions/diff/diff.js';
import { Deployment } from '../deployment/deployment.model.js';
import { AModel } from '../model.abstract.js';
import type { IServer } from './server.interface.js';

/**
 * A Server model is a representation of the logical microservice.
 * E.g. frontend, backend, database, payment-service, etc.
 *
 * @example
 * ```ts
 * const server = new Server('backend');
 * ```
 * @group Models
 * @see Definition of [Default Models](/docs/fundamentals/models#default-models).
 */
@Model()
export class Server extends AModel<IServer, Server> {
  readonly MODEL_NAME: string = 'server';

  /**
   * The name of the server.
   */
  @Validate({ options: { maxLength: 64, minLength: 2, regex: /^[a-zA-Z][\w-]*[a-zA-Z0-9]$/ } })
  readonly serverKey: string;

  constructor(serverKey: string) {
    super();
    this.serverKey = serverKey;
  }

  /**
   * To add a {@link Deployment}.
   */
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

  override async diffProperties(): Promise<Diff[]> {
    return [];
  }

  override setContext(): string {
    const parents = this.getParents();
    const app = parents['app'][0].to;
    return [`${this.MODEL_NAME}=${this.serverKey}`, app.getContext()].join(',');
  }

  override synth(): IServer {
    return {
      serverKey: this.serverKey,
    };
  }

  static override async unSynth(
    server: IServer,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<Server> {
    return new Server(server.serverKey);
  }
}
