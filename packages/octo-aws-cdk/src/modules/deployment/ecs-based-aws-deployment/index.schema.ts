import { Schema, type Server, ServerSchema, Validate } from '@quadnix/octo';
import { EcsServerAnchorSchema } from '../../../anchors/ecs-server/ecs-server.anchor.schema.js';
import {
  EcsTaskDefinitionAnchorPropertiesSchema,
  EcsTaskDefinitionAnchorSchema,
} from '../../../anchors/ecs-task-definition/ecs-task-definition.anchor.schema.js';
import { IamRoleAnchorSchema } from '../../../anchors/iam-role/iam-role.anchor.schema.js';
import { AwsDeploymentSchema } from './models/deployment/aws.deployment.schema.js';

export { AwsDeploymentSchema, EcsTaskDefinitionAnchorPropertiesSchema, EcsTaskDefinitionAnchorSchema };

export class AwsDeploymentModuleSchema {
  @Validate({ options: { isSchema: { schema: EcsTaskDefinitionAnchorPropertiesSchema } } })
  deploymentContainerProperties = Schema<EcsTaskDefinitionAnchorSchema['properties']>();

  @Validate({ options: { minLength: 1 } })
  deploymentTag = Schema<string>();

  @Validate({
    options: {
      isModel: { anchors: [{ schema: EcsServerAnchorSchema }, { schema: IamRoleAnchorSchema }], NODE_NAME: 'server' },
      isSchema: { schema: ServerSchema },
    },
  })
  server = Schema<Server>();
}
