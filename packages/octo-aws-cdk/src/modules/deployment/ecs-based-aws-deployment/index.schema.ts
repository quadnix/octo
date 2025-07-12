import { Schema, type Server, ServerSchema, Validate } from '@quadnix/octo';
import { EcsServerAnchorSchema } from '../../../anchors/ecs-server/ecs-server.anchor.schema.js';
import {
  EcsTaskDefinitionAnchorPropertiesSchema,
  EcsTaskDefinitionAnchorSchema,
} from '../../../anchors/ecs-task-definition/ecs-task-definition.anchor.schema.js';
import { IamRoleAnchorSchema } from '../../../anchors/iam-role/iam-role.anchor.schema.js';

/**
 * `AwsDeploymentModuleSchema` is the input schema for the `AwsDeploymentModule` module.
 * This schema defines the required inputs for creating ECS-based deployments,
 * including container properties and server associations.
 *
 * @group Modules/Deployment/EcsBasedAwsDeployment
 *
 * @hideconstructor
 *
 * @see {@link AwsDeploymentModule} to learn more about the `AwsDeploymentModule` module.
 */
export class AwsDeploymentModuleSchema {
  /**
   * The container properties for the deployment, including CPU, memory, and image configuration.
   * This defines the runtime characteristics of the containerized application.
   */
  @Validate({ options: { isSchema: { schema: EcsTaskDefinitionAnchorPropertiesSchema } } })
  deploymentContainerProperties = Schema<EcsTaskDefinitionAnchorSchema['properties']>();

  /**
   * A unique tag to identify this deployment version.
   * This is used to track and manage different versions of the deployment.
   */
  @Validate({ options: { minLength: 1 } })
  deploymentTag = Schema<string>();

  /**
   * The ECS server that this deployment will be associated with.
   * The server must have ECS server anchors and IAM role anchors configured.
   */
  @Validate({
    options: {
      isModel: { anchors: [{ schema: EcsServerAnchorSchema }, { schema: IamRoleAnchorSchema }], NODE_NAME: 'server' },
      isSchema: { schema: ServerSchema },
    },
  })
  server = Schema<Server>();
}
