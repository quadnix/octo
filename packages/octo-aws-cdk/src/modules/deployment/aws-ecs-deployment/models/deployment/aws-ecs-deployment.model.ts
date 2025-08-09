import { Deployment, Model } from '@quadnix/octo';
import { AwsEcsDeploymentSchema } from './aws-ecs-deployment.schema.js';

/**
 * @internal
 */
@Model<AwsEcsDeployment>('@octo', 'deployment', AwsEcsDeploymentSchema)
export class AwsEcsDeployment extends Deployment {
  static override async unSynth(deployment: AwsEcsDeploymentSchema): Promise<AwsEcsDeployment> {
    return new AwsEcsDeployment(deployment.deploymentTag);
  }
}
