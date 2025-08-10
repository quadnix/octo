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
import { AwsEcsClusterAnchorSchema } from '../../../anchors/aws-ecs/aws-ecs-cluster.anchor.schema.js';
import { AwsEcsTaskDefinitionAnchorSchema } from '../../../anchors/aws-ecs/aws-ecs-task-definition.anchor.schema.js';
import { AwsEfsAnchorSchema } from '../../../anchors/aws-efs/aws-efs.anchor.schema.js';
import { AwsSecurityGroupAnchorRuleSchema } from '../../../anchors/aws-security-group/aws-security-group.anchor.schema.js';

/**
 * Defines the container image properties for execution deployments.
 * This schema configures the container image settings including commands, networking, and runtime characteristics.
 *
 * @group Modules/Execution/AwsEcsExecution
 *
 * @hideconstructor
 */
export class AwsEcsExecutionModuleDeploymentContainerPropertiesImageSchema {
  /**
   * The command to run when the container starts.
   * This overrides the default command specified in the Docker image.
   */
  @Validate({
    destruct: (value: AwsEcsExecutionModuleDeploymentContainerPropertiesImageSchema['command']): string[] =>
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
    destruct: (value: AwsEcsExecutionModuleDeploymentContainerPropertiesImageSchema['ports']): string[] => {
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
 * @group Modules/Execution/AwsEcsExecution
 *
 * @hideconstructor
 */
export class AwsEcsExecutionModuleDeploymentContainerPropertiesSchema {
  /**
   * The CPU units to allocate to the container.
   * This is measured in CPU units where 1024 units = 1 vCPU.
   */
  @Validate({ destruct: (value: number | null): number[] => (value ? [value] : []), options: { minLength: 1 } })
  cpu? = Schema<(256 | 512 | 1024 | 2048 | 4096 | 8192 | 16384) | null>(null);

  /**
   * The image configuration for the container.
   * This defines the container image settings and runtime properties.
   * See {@link AwsEcsExecutionModuleDeploymentContainerPropertiesImageSchema} for options.
   */
  @Validate({
    options: { isSchema: { schema: AwsEcsExecutionModuleDeploymentContainerPropertiesImageSchema } },
  })
  image = Schema<AwsEcsExecutionModuleDeploymentContainerPropertiesImageSchema>();

  /**
   * The memory limit in MiB to allocate to the container.
   * This is the hard limit for memory usage.
   */
  @Validate({ destruct: (value: number | null): number[] => (value ? [value] : []), options: { minLength: 1 } })
  memory? = Schema<number | null>(null);
}

/**
 * `AwsEcsExecutionModuleSchema` is the input schema for the `AwsEcsExecutionModule` module.
 * This schema defines the comprehensive configuration for ECS-based executions,
 * including deployment orchestration, environment settings, networking, and security.
 *
 * @group Modules/Execution/AwsEcsExecution
 *
 * @hideconstructor
 *
 * @see {@link AwsEcsExecutionModule} to learn more about the `AwsEcsExecutionModule` module.
 */
export class AwsEcsExecutionModuleSchema {
  /**
   * The deployment configuration including main and sidecar containers.
   * The main deployment is the primary application container, while sidecars provide supporting functionality.
   */
  @Validate<unknown>([
    {
      destruct: (value: AwsEcsExecutionModuleSchema['deployments']): Deployment[] => [
        value.main.deployment,
        ...value.sidecars.map((d) => d.deployment),
      ],
      options: {
        isModel: { anchors: [{ schema: AwsEcsTaskDefinitionAnchorSchema }], NODE_NAME: 'deployment' },
        isSchema: { schema: DeploymentSchema },
      },
    },
    {
      destruct: (
        value: AwsEcsExecutionModuleSchema['deployments'],
      ): AwsEcsExecutionModuleDeploymentContainerPropertiesSchema[] => [
        value.main.containerProperties,
        ...value.sidecars.map((d) => d.containerProperties),
      ],
      options: { isSchema: { schema: AwsEcsExecutionModuleDeploymentContainerPropertiesSchema } },
    },
  ])
  deployments = Schema<{
    main: {
      containerProperties: AwsEcsExecutionModuleDeploymentContainerPropertiesSchema;
      deployment: Deployment;
    };
    sidecars: {
      containerProperties: Pick<AwsEcsExecutionModuleDeploymentContainerPropertiesSchema, 'image'>;
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
      isModel: { anchors: [{ schema: AwsEcsClusterAnchorSchema }], NODE_NAME: 'environment' },
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
    destruct: (value: AwsEcsExecutionModuleSchema['filesystems']): Filesystem[] => value!,
    options: {
      isModel: { anchors: [{ schema: AwsEfsAnchorSchema }], NODE_NAME: 'filesystem' },
      isSchema: { schema: FilesystemSchema },
    },
  })
  filesystems? = Schema<Filesystem[]>([]);

  /**
   * Security group rules to apply to the execution.
   * These define the network traffic rules for the containers.
   */
  @Validate({
    destruct: (value: AwsEcsExecutionModuleSchema['securityGroupRules']): AwsSecurityGroupAnchorRuleSchema[] => value!,
    options: { isSchema: { schema: AwsSecurityGroupAnchorRuleSchema } },
  })
  securityGroupRules? = Schema<AwsSecurityGroupAnchorRuleSchema[]>([]);

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
      destruct: (value: AwsEcsExecutionModuleSchema['subnet']): SubnetSchema[] => [value.synth()],
      options: {
        isSchema: { schema: SubnetSchema },
      },
    },
  ])
  subnet = Schema<Subnet>();
}
