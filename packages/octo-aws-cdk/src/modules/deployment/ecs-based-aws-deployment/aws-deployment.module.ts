import { AModule, Module, Schema, type Server } from '@quadnix/octo';
import { TaskDefinitionUtility } from '../../../utilities/task-definition/task-definition.utility.js';
import { AwsDeploymentImageTaskDefinitionAnchor } from './anchors/aws-deployment-image-task-definition.anchor.js';
import { AwsDeployment } from './models/deployment/index.js';

export class AwsDeploymentModuleSchema {
  deploymentCpu = Schema<AwsDeploymentImageTaskDefinitionAnchor['properties']['cpu']>();

  deploymentImage = Schema<AwsDeploymentImageTaskDefinitionAnchor['properties']['image']>();

  deploymentMemory = Schema<number>();

  deploymentTag = Schema<string>();

  server = Schema<Server>();
}

@Module<AwsDeploymentModule>('@octo', AwsDeploymentModuleSchema)
export class AwsDeploymentModule extends AModule<AwsDeploymentModuleSchema, AwsDeployment> {
  async onInit(inputs: AwsDeploymentModuleSchema): Promise<AwsDeployment> {
    const server = inputs.server;

    if (!TaskDefinitionUtility.isCpuAndMemoryValid(inputs.deploymentCpu, inputs.deploymentMemory)) {
      throw new Error('Invalid values for CPU and/or memory!');
    }

    // Create a new deployment.
    const deployment = new AwsDeployment(inputs.deploymentTag);
    server.addDeployment(deployment);

    const awsTaskDefinitionAnchor = new AwsDeploymentImageTaskDefinitionAnchor(
      'AwsDeploymentImageTaskDefinitionAnchor',
      { cpu: inputs.deploymentCpu, image: inputs.deploymentImage, memory: inputs.deploymentMemory },
      deployment,
    );
    deployment.addAnchor(awsTaskDefinitionAnchor);

    return deployment;
  }
}
