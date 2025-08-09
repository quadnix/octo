import { AModule, type Deployment, Module } from '@quadnix/octo';
import { AwsEcsTaskDefinitionAnchor } from '../../../anchors/aws-ecs/aws-ecs-task-definition.anchor.js';
import { AwsEcsDeploymentModuleSchema } from './index.schema.js';
import { AwsEcsDeployment } from './models/deployment/index.js';

/**
 * `AwsEcsDeploymentModule` is an ECS-based AWS deployment module
 * that provides an implementation for the `Deployment` model.
 * This module creates deployments for ECS-based servers with container configurations for task definitions.
 * It establishes the relationship between servers and their deployment configurations.
 *
 * @example
 * TypeScript
 * ```ts
 * import { AwsEcsDeploymentModule } from '@quadnix/octo-aws-cdk/modules/deployment/aws-ecs-deployment';
 *
 * octo.loadModule(AwsEcsDeploymentModule, 'my-deployment-module', {
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
 * @group Modules/Deployment/AwsEcsDeployment
 *
 * @see {@link AwsEcsDeploymentModuleSchema} for the input schema.
 * @see {@link AModule} to learn more about modules.
 * @see {@link Deployment} to learn more about the `Deployment` model.
 */
@Module<AwsEcsDeploymentModule>('@octo', AwsEcsDeploymentModuleSchema)
export class AwsEcsDeploymentModule extends AModule<AwsEcsDeploymentModuleSchema, Deployment> {
  async onInit(inputs: AwsEcsDeploymentModuleSchema): Promise<AwsEcsDeployment> {
    const server = inputs.server;

    // Create a new deployment.
    const deployment = new AwsEcsDeployment(inputs.deploymentTag);
    server.addDeployment(deployment);

    const containerProperties = inputs.deploymentContainerProperties;
    deployment.addAnchor(
      new AwsEcsTaskDefinitionAnchor(
        'AwsEcsTaskDefinitionAnchor',
        { cpu: containerProperties.cpu, image: containerProperties.image, memory: containerProperties.memory },
        deployment,
      ),
    );

    return deployment;
  }
}
