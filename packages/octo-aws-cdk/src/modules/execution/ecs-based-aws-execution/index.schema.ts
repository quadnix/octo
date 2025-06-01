import {
  type Deployment,
  DeploymentSchema,
  type Environment,
  EnvironmentSchema,
  type Filesystem,
  FilesystemSchema,
  Schema,
  type Subnet,
  SubnetSchema,
  Validate,
} from '@quadnix/octo';
import { EcsClusterAnchorSchema } from '../../../anchors/ecs-cluster/ecs-cluster.anchor.schema.js';
import { EcsExecutionAnchorSchema } from '../../../anchors/ecs-execution/ecs-execution.anchor.schema.js';
import { EcsServiceAnchorSchema } from '../../../anchors/ecs-service/ecs-service.anchor.schema.js';
import { EcsTaskDefinitionAnchorSchema } from '../../../anchors/ecs-task-definition/ecs-task-definition.anchor.schema.js';
import { EfsFilesystemAnchorSchema } from '../../../anchors/efs-filesystem/efs-filesystem.anchor.schema.js';
import {
  SecurityGroupAnchorRuleSchema,
  SecurityGroupAnchorSchema,
} from '../../../anchors/security-group/security-group.anchor.schema.js';
import { EcsServiceSchema } from '../../../resources/ecs-service/index.schema.js';
import { EcsTaskDefinitionSchema } from '../../../resources/ecs-task-definition/index.schema.js';
import { SecurityGroupSchema } from '../../../resources/security-group/index.schema.js';
import { AwsExecutionSchema } from './models/execution/aws.execution.schema.js';
import {
  AwsExecutionOverlayDeploymentContainerPropertiesSchema,
  AwsExecutionOverlaySchema,
} from './overlays/execution/aws-execution.schema.js';
import { ServerExecutionSecurityGroupOverlaySchema } from './overlays/server-execution-security-group/server-execution-security-group.overlay.schema.js';

export {
  AwsExecutionOverlayDeploymentContainerPropertiesSchema,
  AwsExecutionOverlaySchema,
  AwsExecutionSchema,
  EcsExecutionAnchorSchema,
  EcsServiceAnchorSchema,
  EcsServiceSchema,
  EcsTaskDefinitionSchema,
  SecurityGroupAnchorRuleSchema,
  SecurityGroupAnchorSchema,
  SecurityGroupSchema,
  ServerExecutionSecurityGroupOverlaySchema,
};

export class AwsExecutionModuleSchema {
  @Validate({
    options: {
      isModel: { anchors: [{ schema: EcsTaskDefinitionAnchorSchema }], NODE_NAME: 'deployment' },
      isSchema: { schema: DeploymentSchema },
    },
  })
  deployment = Schema<Deployment>();

  @Validate({
    destruct: (
      value: AwsExecutionOverlayDeploymentContainerPropertiesSchema,
    ): AwsExecutionOverlayDeploymentContainerPropertiesSchema[] => (Object.keys(value).length > 0 ? [value] : []),
    options: { isSchema: { schema: AwsExecutionOverlayDeploymentContainerPropertiesSchema } },
  })
  deploymentContainerProperties? = Schema<AwsExecutionOverlayDeploymentContainerPropertiesSchema>({});

  @Validate({ options: { minLength: 1 } })
  desiredCount = Schema<number>();

  @Validate({
    options: {
      isModel: { anchors: [{ schema: EcsClusterAnchorSchema }], NODE_NAME: 'environment' },
      isSchema: { schema: EnvironmentSchema },
    },
  })
  environment = Schema<Environment>();

  @Validate({
    destruct: (value: AwsExecutionModuleSchema['filesystems']): Filesystem[] => value!,
    options: {
      isModel: { anchors: [{ schema: EfsFilesystemAnchorSchema }], NODE_NAME: 'filesystem' },
      isSchema: { schema: FilesystemSchema },
    },
  })
  filesystems? = Schema<Filesystem[]>([]);

  @Validate([
    {
      destruct: (value: Record<string, string>): string[] => Object.keys(value),
      options: { regex: /^\w{2,}\b$/ },
    },
    {
      destruct: (value: Record<string, string>): string[] => Object.values(value),
      options: { regex: /^.+$/ },
    },
  ])
  environmentVariables? = Schema<Record<string, string>>({});

  @Validate({
    destruct: (value: AwsExecutionModuleSchema['securityGroupRules']): SecurityGroupAnchorRuleSchema[] => value!,
    options: { isSchema: { schema: SecurityGroupAnchorRuleSchema } },
  })
  securityGroupRules? = Schema<SecurityGroupAnchorRuleSchema[]>([]);

  @Validate([
    {
      options: {
        isModel: { NODE_NAME: 'subnet' },
      },
    },
    {
      destruct: (value: AwsExecutionModuleSchema['subnet']): SubnetSchema[] => [value.synth()],
      options: {
        isSchema: { schema: SubnetSchema },
      },
    },
  ])
  subnet = Schema<Subnet>();
}
