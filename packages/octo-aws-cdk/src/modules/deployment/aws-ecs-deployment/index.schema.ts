import { Schema, type Server, ServerSchema, Validate } from '@quadnix/octo';
import { AwsEcsServerAnchorSchema } from '../../../anchors/aws-ecs/aws-ecs-server.anchor.schema.js';
import {
  AwsEcsTaskDefinitionAnchorPropertiesSchema,
  AwsEcsTaskDefinitionAnchorSchema,
} from '../../../anchors/aws-ecs/aws-ecs-task-definition.anchor.schema.js';
import { AwsIamRoleAnchorSchema } from '../../../anchors/aws-iam/aws-iam-role.anchor.schema.js';

/**
 * `AwsEcsDeploymentModuleSchema` is the input schema for the `AwsEcsDeploymentModule` module.
 * This schema defines the required inputs for creating ECS-based deployments,
 * including container properties and server associations.
 *
 * @group Modules/Deployment/AwsEcsDeployment
 *
 * @hideconstructor
 *
 * @see {@link AwsEcsDeploymentModule} to learn more about the `AwsEcsDeploymentModule` module.
 */
export class AwsEcsDeploymentModuleSchema {
  /**
   * The container properties for the deployment, including CPU, memory, and image configuration.
   * This defines the runtime characteristics of the containerized application.
   */
  @Validate({ options: { isSchema: { schema: AwsEcsTaskDefinitionAnchorPropertiesSchema } } })
  deploymentContainerProperties = Schema<AwsEcsTaskDefinitionAnchorSchema['properties']>();

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
      isModel: {
        anchors: [{ schema: AwsEcsServerAnchorSchema }, { schema: AwsIamRoleAnchorSchema }],
        NODE_NAME: 'server',
      },
      isSchema: { schema: ServerSchema },
    },
  })
  server = Schema<Server>();
}
