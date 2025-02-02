import { AModule, Module } from '@quadnix/octo';
import { EcsTaskDefinitionAnchor } from '../../../anchors/ecs-task-definition/ecs-task-definition.anchor.js';
import { AwsDeploymentModuleSchema } from './index.schema.js';
import { AwsDeployment } from './models/deployment/index.js';

@Module<AwsDeploymentModule>('@octo', AwsDeploymentModuleSchema)
export class AwsDeploymentModule extends AModule<AwsDeploymentModuleSchema, AwsDeployment> {
  async onInit(inputs: AwsDeploymentModuleSchema): Promise<AwsDeployment> {
    const server = inputs.server;

    // Create a new deployment.
    const deployment = new AwsDeployment(inputs.deploymentTag);
    server.addDeployment(deployment);

    const containerProperties = inputs.deploymentContainerProperties;
    const taskDefinitionAnchor = new EcsTaskDefinitionAnchor(
      'EcsTaskDefinitionAnchor',
      { cpu: containerProperties.cpu, image: containerProperties.image, memory: containerProperties.memory },
      deployment,
    );
    deployment.addAnchor(taskDefinitionAnchor);

    return deployment;
  }
}
