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
import { AwsExecutionOverlaySchema } from './overlays/execution/aws-execution.schema.js';
import { ServerExecutionSecurityGroupOverlaySchema } from './overlays/server-execution-security-group/server-execution-security-group.overlay.schema.js';

export { AwsExecutionOverlaySchema, ServerExecutionSecurityGroupOverlaySchema };

export class AwsExecutionModuleDeploymentContainerPropertiesImageSchema {
  @Validate({
    destruct: (value: AwsExecutionModuleDeploymentContainerPropertiesImageSchema['command']): string[] =>
      value ? [value] : [],
    options: { minLength: 1 },
  })
  command? = Schema<string | null>(null);

  @Validate({ options: { minLength: 1 } })
  essential = Schema<boolean>();

  @Validate({ options: { minLength: 1 } })
  name = Schema<string>();

  @Validate({
    destruct: (value: AwsExecutionModuleDeploymentContainerPropertiesImageSchema['ports']): string[] => {
      const values: string[] = [];
      for (const portMapping of value!) {
        values.push(String(portMapping.containerPort), portMapping.protocol);
      }
      return values;
    },
    options: { minLength: 1 },
  })
  ports? = Schema<
    {
      containerPort: number;
      protocol: 'tcp' | 'udp';
    }[]
  >([]);
}

export class AwsExecutionModuleDeploymentContainerPropertiesSchema {
  @Validate({ destruct: (value: number | null): number[] => (value ? [value] : []), options: { minLength: 1 } })
  cpu? = Schema<(256 | 512 | 1024 | 2048 | 4096 | 8192 | 16384) | null>(null);

  @Validate({
    options: { isSchema: { schema: AwsExecutionModuleDeploymentContainerPropertiesImageSchema } },
  })
  image = Schema<AwsExecutionModuleDeploymentContainerPropertiesImageSchema>();

  @Validate({ destruct: (value: number | null): number[] => (value ? [value] : []), options: { minLength: 1 } })
  memory? = Schema<number | null>(null);
}

export class AwsExecutionModuleSchema {
  @Validate<unknown>([
    {
      destruct: (value: AwsExecutionModuleSchema['deployments']): Deployment[] => [
        value.main.deployment,
        ...value.sidecars.map((d) => d.deployment),
      ],
      options: {
        isModel: { anchors: [{ schema: EcsTaskDefinitionAnchorSchema }], NODE_NAME: 'deployment' },
        isSchema: { schema: DeploymentSchema },
      },
    },
    {
      destruct: (
        value: AwsExecutionModuleSchema['deployments'],
      ): AwsExecutionModuleDeploymentContainerPropertiesSchema[] => [
        value.main.containerProperties,
        ...value.sidecars.map((d) => d.containerProperties),
      ],
      options: { isSchema: { schema: AwsExecutionModuleDeploymentContainerPropertiesSchema } },
    },
  ])
  deployments = Schema<{
    main: {
      containerProperties: AwsExecutionModuleDeploymentContainerPropertiesSchema;
      deployment: Deployment;
    };
    sidecars: {
      containerProperties: Pick<AwsExecutionModuleDeploymentContainerPropertiesSchema, 'image'>;
      deployment: Deployment;
    }[];
  }>();

  @Validate({ options: { minLength: 1 } })
  desiredCount = Schema<number>();

  @Validate({
    options: {
      isModel: { anchors: [{ schema: EcsClusterAnchorSchema }], NODE_NAME: 'environment' },
      isSchema: { schema: EnvironmentSchema },
    },
  })
  environment = Schema<Environment>();

  @Validate({ options: { minLength: 1 } })
  executionId = Schema<string>();

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
