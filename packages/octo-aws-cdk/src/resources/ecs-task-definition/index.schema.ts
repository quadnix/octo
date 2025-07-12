import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

/**
 * Defines a key-value pair representing an environment variable to be passed to the container.
 *
 * @group Resources/EcsTaskDefinition
 *
 * @hideconstructor
 */
export class EcsTaskDefinitionEnvironmentVariableSchema {
  /**
   * The name of the environment variable.
   */
  @Validate({ options: { minLength: 1 } })
  name = Schema<string>();

  /**
   * The value of the environment variable.
   */
  @Validate({ options: { minLength: 1 } })
  value = Schema<string>();
}

/**
 * Defines the port mapping to use on the container in the task definition.
 *
 * @group Resources/EcsTaskDefinition
 *
 * @hideconstructor
 */
export class EcsTaskDefinitionImagePortSchema {
  /**
   * The port number that the container is listening on.
   */
  @Validate({ options: { minLength: 1 } })
  containerPort = Schema<number>();

  /**
   * The protocol that the container is listening on.
   */
  @Validate({ options: { minLength: 1 } })
  protocol = Schema<'tcp' | 'udp'>();
}

/**
 * Defines the container image and its properties.
 *
 * @group Resources/EcsTaskDefinition
 *
 * @hideconstructor
 */
export class EcsTaskDefinitionImageSchema {
  /**
   * The command to run in the container.
   */
  @Validate({ options: { minLength: 1 } })
  command = Schema<string[]>();

  /**
   * Defines the behavior when the container exits.
   * Essential containers kill the whole task upon exit.
   */
  @Validate({ options: { minLength: 1 } })
  essential = Schema<boolean>();

  /**
   * The name of the image.
   * It must be unique within this task definition.
   */
  @Validate({ options: { minLength: 1 } })
  name = Schema<string>();

  /**
   * The ports exposed by the container.
   * See {@link EcsTaskDefinitionImagePortSchema} for options.
   */
  @Validate({
    destruct: (value: EcsTaskDefinitionImageSchema['ports']): EcsTaskDefinitionImagePortSchema[] => value,
    options: { isSchema: { schema: EcsTaskDefinitionImagePortSchema } },
  })
  ports = Schema<EcsTaskDefinitionImagePortSchema[]>();

  /**
   * The URI of the image.
   * This is usually an URI from "docker hub" or "ecr".
   */
  @Validate({ options: { minLength: 1 } })
  uri = Schema<string>();
}

/**
 * The `EcsTaskDefinitionSchema` class is the schema for the `EcsTaskDefinition` resource,
 * which represents the AWS Elastic Container Service (ECS) Task Definition resource.
 * This resource can create a ecs task definition in AWS using the AWS JavaScript SDK V3 API.
 * See [official sdk docs](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ecs/).
 *
 * @group Resources/EcsTaskDefinition
 *
 * @hideconstructor
 *
 * @overrideProperty parents - This resource has parents.
 * ```mermaid
 * graph TD;
 *   iam_role((Iam<br>Role)) --> ecs_task_definition((Ecs<br>Task<br>Definition))
 *   efs((Efs)) --> ecs_task_definition
 * ```
 * @overrideProperty resourceId - The resource id is of format `ecs-task-definition-<execution-id>`
 */
export class EcsTaskDefinitionSchema extends BaseResourceSchema {
  /**
   * Input properties.
   * * `properties.awsAccountId` - The AWS account ID.
   * * `properties.awsRegionId` - The AWS region ID.
   * * `properties.cpu` - The number of CPU units to reserve for the container.
   * * `properties.deploymentTag` - The deployment tag, generally mapped to the deployment model deploymentTag property.
   * This is usually defined in conjunction with the `family` (server key).
   * Both the properties together specify the server and the code currently referenced in the task definition.
   * E.g. deploymentTag = v0 might mean the tag in GitHub, or a specific branch, or commit.
   * * `properties.environmentVariables` - The list of environment variables to pass to the container.
   * See {@link EcsTaskDefinitionEnvironmentVariableSchema} for options.
   * * `properties.family` - The family of the task definition, generally mapped to the server model serverKey property.
   * This is usually defined in conjunction with the `deploymentTag`.
   * Both the properties together specify the server and the code currently referenced in the task definition.
   * E.g. family = backend indicates that this task definition is for the backend server.
   * * `properties.images` - The containers to run as part of the task definition.
   * See {@link EcsTaskDefinitionImageSchema} for options.
   * * `properties.memory` - The amount of memory to reserve for the container.
   */
  @Validate<unknown>([
    {
      destruct: (value: EcsTaskDefinitionSchema['properties']): string[] => [
        value.awsAccountId,
        value.awsRegionId,
        String(value.cpu),
        value.deploymentTag,
        value.family,
        String(value.memory),
      ],
      options: { minLength: 1 },
    },
    {
      destruct: (value: EcsTaskDefinitionSchema['properties']): EcsTaskDefinitionEnvironmentVariableSchema[] =>
        value.environmentVariables,
      options: { isSchema: { schema: EcsTaskDefinitionEnvironmentVariableSchema } },
    },
    {
      destruct: (value: EcsTaskDefinitionSchema['properties']): EcsTaskDefinitionImageSchema[] => value.images,
      options: { isSchema: { schema: EcsTaskDefinitionImageSchema } },
    },
  ])
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
    cpu: number;
    deploymentTag: string;
    environmentVariables: EcsTaskDefinitionEnvironmentVariableSchema[];
    family: string;
    images: EcsTaskDefinitionImageSchema[];
    memory: number;
  }>();

  /**
   * Saved response.
   * * `response.revision` - The current revision of the task definition.
   * * `response.taskDefinitionArn` - The ARN of the task definition.
   */
  @Validate({
    destruct: (value: EcsTaskDefinitionSchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.revision) {
        subjects.push(String(value.revision));
      }
      if (value.taskDefinitionArn) {
        subjects.push(value.taskDefinitionArn);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    revision?: number;
    taskDefinitionArn?: string;
  }>();
}
