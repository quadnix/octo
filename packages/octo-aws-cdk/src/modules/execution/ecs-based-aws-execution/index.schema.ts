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

/**
 * Defines the container image properties for execution deployments.
 * This schema configures the container image settings including commands, networking, and runtime characteristics.
 *
 * @group Modules/Execution/EcsBasedAwsExecution
 *
 * @hideconstructor
 */
export class AwsExecutionModuleDeploymentContainerPropertiesImageSchema {
  /**
   * The command to run when the container starts.
   * This overrides the default command specified in the Docker image.
   */
  @Validate({
    destruct: (value: AwsExecutionModuleDeploymentContainerPropertiesImageSchema['command']): string[] =>
      value ? [value] : [],
    options: { minLength: 1 },
  })
  command? = Schema<string | null>(null);

  /**
   * Whether this container is essential for the task.
   * If an essential container fails, the entire task is stopped.
   */
  @Validate({ options: { minLength: 1 } })
  essential = Schema<boolean>();

  /**
   * The name of the container within the task definition.
   * This name is used to reference the container in other configurations.
   */
  @Validate({ options: { minLength: 1 } })
  name = Schema<string>();

  /**
   * The port mappings for the container.
   * These define which container ports are exposed and on which protocols.
   */
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

/**
 * Defines the container properties for execution deployments.
 * This schema configures the CPU, memory, and image settings for containers in the execution.
 *
 * @group Modules/Execution/EcsBasedAwsExecution
 *
 * @hideconstructor
 */
export class AwsExecutionModuleDeploymentContainerPropertiesSchema {
  /**
   * The CPU units to allocate to the container.
   * This is measured in CPU units where 1024 units = 1 vCPU.
   */
  @Validate({ destruct: (value: number | null): number[] => (value ? [value] : []), options: { minLength: 1 } })
  cpu? = Schema<(256 | 512 | 1024 | 2048 | 4096 | 8192 | 16384) | null>(null);

  /**
   * The image configuration for the container.
   * This defines the container image settings and runtime properties.
   * See {@link AwsExecutionModuleDeploymentContainerPropertiesImageSchema} for options.
   */
  @Validate({
    options: { isSchema: { schema: AwsExecutionModuleDeploymentContainerPropertiesImageSchema } },
  })
  image = Schema<AwsExecutionModuleDeploymentContainerPropertiesImageSchema>();

  /**
   * The memory limit in MiB to allocate to the container.
   * This is the hard limit for memory usage.
   */
  @Validate({ destruct: (value: number | null): number[] => (value ? [value] : []), options: { minLength: 1 } })
  memory? = Schema<number | null>(null);
}

/**
 * `AwsExecutionModuleSchema` is the input schema for the `AwsExecutionModule` module.
 * This schema defines the comprehensive configuration for ECS-based executions,
 * including deployment orchestration, environment settings, networking, and security.
 *
 * @group Modules/Execution/EcsBasedAwsExecution
 *
 * @hideconstructor
 *
 * @see {@link AwsExecutionModule} to learn more about the `AwsExecutionModule` module.
 */
export class AwsExecutionModuleSchema {
  /**
   * The deployment configuration including main and sidecar containers.
   * The main deployment is the primary application container, while sidecars provide supporting functionality.
   */
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

  /**
   * The desired number of running instances of the service.
   * This defines how many tasks should be running simultaneously.
   */
  @Validate({ options: { minLength: 1 } })
  desiredCount = Schema<number>();

  /**
   * The environment where this execution will run.
   * The environment must have ECS cluster anchors configured.
   */
  @Validate({
    options: {
      isModel: { anchors: [{ schema: EcsClusterAnchorSchema }], NODE_NAME: 'environment' },
      isSchema: { schema: EnvironmentSchema },
    },
  })
  environment = Schema<Environment>();

  /**
   * Environment variables to set for the execution.
   * These are available to all containers in the task.
   * Keys must be valid environment variable names (alphanumeric with minimum 2 characters).
   */
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

  /**
   * A unique identifier for this execution.
   * This is used to distinguish between different executions in the same environment.
   */
  @Validate({ options: { minLength: 1 } })
  executionId = Schema<string>();

  /**
   * The filesystems to mount in the execution.
   * These provide persistent storage for the containers.
   */
  @Validate({
    destruct: (value: AwsExecutionModuleSchema['filesystems']): Filesystem[] => value!,
    options: {
      isModel: { anchors: [{ schema: EfsFilesystemAnchorSchema }], NODE_NAME: 'filesystem' },
      isSchema: { schema: FilesystemSchema },
    },
  })
  filesystems? = Schema<Filesystem[]>([]);

  /**
   * Security group rules to apply to the execution.
   * These define the network traffic rules for the containers.
   */
  @Validate({
    destruct: (value: AwsExecutionModuleSchema['securityGroupRules']): SecurityGroupAnchorRuleSchema[] => value!,
    options: { isSchema: { schema: SecurityGroupAnchorRuleSchema } },
  })
  securityGroupRules? = Schema<SecurityGroupAnchorRuleSchema[]>([]);

  /**
   * The subnet where the execution will run.
   * This defines the network isolation and connectivity for the containers.
   */
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
