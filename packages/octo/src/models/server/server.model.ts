import { strict as assert } from 'assert';
import type { UnknownModel } from '../../app.type.js';
import { Model } from '../../decorators/model.decorator.js';
import { Validate } from '../../decorators/validate.decorator.js';
import { ModelError } from '../../errors/index.js';
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
@Model('@octo', 'server')
export class Server extends AModel<IServer, Server> {
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
      throw new ModelError('Deployment already exists!', this);
    }
    this.addChild('serverKey', deployment, 'deploymentTag');
  }

  override setContext(): string {
    const parents = this.getParents();
    const app = parents['app'][0].to;
    return [`${(this.constructor as typeof Server).NODE_NAME}=${this.serverKey}`, app.getContext()].join(',');
  }

  override synth(): IServer {
    return {
      serverKey: this.serverKey,
    };
  }

  static override async unSynth(
    server: IServer,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<Server> {
    assert(!!deReferenceContext);

    return new Server(server.serverKey);
  }
}
