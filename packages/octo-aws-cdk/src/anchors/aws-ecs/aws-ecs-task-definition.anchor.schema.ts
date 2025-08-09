import { BaseAnchorSchema, type Deployment, Schema, Validate } from '@quadnix/octo';

/**
 * Defines the port mapping to use on the container in the task definition.
 *
 * @group Anchors/AwsEcs
 *
 * @hideconstructor
 */
export class AwsEcsTaskDefinitionAnchorImagePortSchema {
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
 * @group Anchors/AwsEcs
 *
 * @hideconstructor
 */
export class AwsEcsTaskDefinitionAnchorImageSchema {
  /**
   * The command to run in the container.
   */
  @Validate({ options: { minLength: 1 } })
  command = Schema<string>();

  /**
   * The ports exposed by the container.
   * See {@link AwsEcsTaskDefinitionAnchorImagePortSchema} for options.
   */
  @Validate({
    destruct: (value: AwsEcsTaskDefinitionAnchorImageSchema['ports']): AwsEcsTaskDefinitionAnchorImagePortSchema[] =>
      value,
    options: { isSchema: { schema: AwsEcsTaskDefinitionAnchorImagePortSchema } },
  })
  ports = Schema<AwsEcsTaskDefinitionAnchorImagePortSchema[]>();

  /**
   * The URI of the image.
   * This is usually an URI from "docker hub" or "ecr".
   */
  @Validate({ options: { minLength: 1 } })
  uri = Schema<string>();
}

/**
 * Defines the shape of an AWS ECS task definition.
 *
 * @group Anchors/AwsEcs
 *
 * @hideconstructor
 */
export class AwsEcsTaskDefinitionAnchorPropertiesSchema {
  /**
   * The number of CPU units to reserve for the containers.
   */
  @Validate({ options: { minLength: 1 } })
  cpu = Schema<256 | 512 | 1024 | 2048 | 4096 | 8192 | 16384>();

  /**
   * Defines The containers to run as part of the task definition.
   * See {@link AwsEcsTaskDefinitionAnchorImageSchema} for options.
   */
  @Validate({ options: { isSchema: { schema: AwsEcsTaskDefinitionAnchorImageSchema } } })
  image = Schema<AwsEcsTaskDefinitionAnchorImageSchema>();

  /**
   * The amount of memory to reserve for the containers.
   */
  @Validate({ options: { minLength: 1 } })
  memory = Schema<number>();
}

/**
 * This anchor is associated with a {@link Deployment} model representing an AWS ECS task definition.
 *
 * @group Anchors/AwsEcs
 *
 * @hideconstructor
 */
export class AwsEcsTaskDefinitionAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Deployment;

  /**
   * Input properties.
   * See {@link AwsEcsTaskDefinitionAnchorPropertiesSchema} for options.
   */
  @Validate({ options: { isSchema: { schema: AwsEcsTaskDefinitionAnchorPropertiesSchema } } })
  override properties = Schema<{
    [K in keyof AwsEcsTaskDefinitionAnchorPropertiesSchema]: AwsEcsTaskDefinitionAnchorPropertiesSchema[K];
  }>();
}
