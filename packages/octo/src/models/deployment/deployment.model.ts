import { strict as assert } from 'assert';
import type { UnknownModel } from '../../app.type.js';
import { Model } from '../../decorators/model.decorator.js';
import { Validate } from '../../decorators/validate.decorator.js';
import { AModel } from '../model.abstract.js';
import type { IDeployment } from './deployment.interface.js';

/**
 * A deployment model is an instance of server's code at a specific point in time.
 * Every change/commit in server code should generate a new deployment.
 *
 * @example
 * ```ts
 * const deployment = new Deployment('v0.0.1');
 * ```
 * @group Models
 * @see Definition of [Default Models](/docs/fundamentals/models#default-models).
 */
@Model('@octo', 'deployment')
export class Deployment extends AModel<IDeployment, Deployment> {
  /**
   * The identifying tag that can point to the server's code at a specific point in time.
   * Could be a version number or a commit hash.
   */
  @Validate({ options: { maxLength: 32, minLength: 2, regex: /^[a-zA-Z0-9][\w.-]*[a-zA-Z0-9]$/ } })
  readonly deploymentTag: string;

  constructor(deploymentTag: string) {
    super();
    this.deploymentTag = deploymentTag;
  }

  override setContext(): string {
    const parents = this.getParents();
    const parent = parents['server'][0].to;
    return [`${(this.constructor as typeof Deployment).NODE_NAME}=${this.deploymentTag}`, parent.getContext()].join(
      ',',
    );
  }

  override synth(): IDeployment {
    return {
      deploymentTag: this.deploymentTag,
    };
  }

  static override async unSynth(
    deployment: IDeployment,
    deReferenceContext: (context: string) => Promise<UnknownModel>,
  ): Promise<Deployment> {
    assert(!!deReferenceContext);

    return new Deployment(deployment.deploymentTag);
  }
}
