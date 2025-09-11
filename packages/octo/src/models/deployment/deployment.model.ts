import { strict as assert } from 'assert';
import type { UnknownModel } from '../../app.type.js';
import { Model } from '../../decorators/model.decorator.js';
import { AModel } from '../model.abstract.js';
import { DeploymentSchema } from './deployment.schema.js';

/**
 * A deployment model is an instance of server's code at a specific point in time.
 * Every change/commit in server code should generate a new deployment.
 *
 * @example
 * ```ts
 * const deployment = new Deployment('v1');
 * ```
 *
 * @group Models/Deployment
 *
 * @see Definition of [Default Models](/docs/fundamentals/models#default-models).
 */
@Model<Deployment>('@octo', 'deployment', DeploymentSchema)
export class Deployment extends AModel<DeploymentSchema, Deployment> {
  readonly deploymentTag: string;

  constructor(deploymentTag: string) {
    super();
    this.deploymentTag = deploymentTag;
  }

  override setContext(): string | undefined {
    const parents = this.getParents();
    const parent = parents['server']?.[0]?.to;
    if (!parent) {
      return undefined;
    }
    return [`${(this.constructor as typeof Deployment).NODE_NAME}=${this.deploymentTag}`, parent.getContext()].join(
      ',',
    );
  }

  override synth(): DeploymentSchema {
    return {
      deploymentTag: this.deploymentTag,
    };
  }

  static override async unSynth(
    deployment: DeploymentSchema,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<Deployment> {
    assert(!!deReferenceContext);

    return new Deployment(deployment.deploymentTag);
  }
}
