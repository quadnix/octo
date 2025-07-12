import { AModule, type Deployment, Module } from '@quadnix/octo';
import { EcsTaskDefinitionAnchor } from '../../../anchors/ecs-task-definition/ecs-task-definition.anchor.js';
import { AwsDeploymentModuleSchema } from './index.schema.js';
import { AwsDeployment } from './models/deployment/index.js';

/**
 * `AwsDeploymentModule` is an ECS-based AWS deployment module
 * that provides an implementation for the `Deployment` model.
 * This module creates deployments for ECS-based servers with container configurations for task definitions.
 * It establishes the relationship between servers and their deployment configurations.
 *
 * @example
 * TypeScript
 * ```ts
 * import { AwsDeploymentModule } from '@quadnix/octo-aws-cdk/modules/deployment/ecs-based-aws-deployment';
 *
 * octo.loadModule(AwsDeploymentModule, 'my-deployment-module', {
 *   deploymentContainerProperties: {
 *     cpu: 256,
 *     image: {
 *       command: 'npm start',
 *       ports: [{ containerPort: 3000, protocol: 'tcp' }],
 *       uri: 'my-app:latest',
 *     },
 *     memory: 512,
 *   },
 *   deploymentTag: 'v1.0.0',
 *   server: myServer,
 * });
 * ```
 *
 * @group Modules/Deployment/EcsBasedAwsDeployment
 *
 * @see {@link AwsDeploymentModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 * @see {@link Deployment} to learn more about the `Deployment` model.
 */
@Module<AwsDeploymentModule>('@octo', AwsDeploymentModuleSchema)
export class AwsDeploymentModule extends AModule<AwsDeploymentModuleSchema, Deployment> {
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
