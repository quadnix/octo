import { Deployment, Model } from '@quadnix/octo';
import { AwsDeploymentSchema } from './aws.deployment.schema.js';

@Model<AwsDeployment>('@octo', 'deployment', AwsDeploymentSchema)
export class AwsDeployment extends Deployment {
  static override async unSynth(awsDeployment: AwsDeploymentSchema): Promise<AwsDeployment> {
    return new AwsDeployment(awsDeployment.deploymentTag);
  }
}
