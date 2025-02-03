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
import { EcsTaskDefinitionAnchorSchema } from '../../../anchors/ecs-task-definition/ecs-task-definition.anchor.schema.js';
import { EfsFilesystemAnchorSchema } from '../../../anchors/efs-filesystem/efs-filesystem.anchor.schema.js';
import { SecurityGroupAnchorRuleSchema } from '../../../anchors/security-group/security-group.anchor.schema.js';

export { AwsExecutionSchema } from './models/execution/aws.execution.schema.js';
export { AwsExecutionOverlaySchema } from './overlays/execution/aws-execution.schema.js';
export { ServerExecutionSecurityGroupOverlaySchema } from './overlays/server-execution-security-group/server-execution-security-group.overlay.schema.js';

export class AwsExecutionModuleSchema {
  @Validate({
    options: {
      isModel: { anchors: [EcsTaskDefinitionAnchorSchema], NODE_NAME: 'deployment' },
      isSchema: { schema: DeploymentSchema },
    },
  })
  deployment = Schema<Deployment>();

  @Validate({ options: { minLength: 1 } })
  desiredCount = Schema<number>();

  @Validate({
    options: {
      isModel: { anchors: [EcsClusterAnchorSchema], NODE_NAME: 'environment' },
      isSchema: { schema: EnvironmentSchema },
    },
  })
  environment = Schema<Environment>();

  @Validate({
    destruct: (value: AwsExecutionModuleSchema['filesystems']): Filesystem[] => value!,
    options: {
      isModel: { anchors: [EfsFilesystemAnchorSchema], NODE_NAME: 'filesystem' },
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

  @Validate({
    options: {
      isModel: { NODE_NAME: 'subnet' },
      isSchema: { schema: SubnetSchema },
    },
  })
  subnet = Schema<Subnet>();
}
