import { Deployment, Model } from '@quadnix/octo';
import { AwsDeploymentSchema } from './aws-deployment.schema.js';

/**
 * @internal
 */
@Model<AwsDeployment>('@octo', 'deployment', AwsDeploymentSchema, { createsNothing: true })
export class AwsDeployment extends Deployment {
  /**
   * @internal
   */
  static override async unSynth(deployment: AwsDeploymentSchema): Promise<AwsDeployment> {
    return new AwsDeployment(deployment.deploymentTag);
  }
}
