import { BaseAnchorSchema, type Deployment, Schema, Validate } from '@quadnix/octo';

/**
 * Defines the port mapping to use on the container in the task definition.
 *
 * @group Anchors/EcsTaskDefinition
 *
 * @hideconstructor
 */
export class EcsTaskDefinitionAnchorImagePortSchema {
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
 * @group Anchors/EcsTaskDefinition
 *
 * @hideconstructor
 */
export class EcsTaskDefinitionAnchorImageSchema {
  /**
   * The command to run in the container.
   */
  @Validate({ options: { minLength: 1 } })
  command = Schema<string>();

  /**
   * The ports exposed by the container.
   * See {@link EcsTaskDefinitionAnchorImagePortSchema} for options.
   */
  @Validate({
    destruct: (value: EcsTaskDefinitionAnchorImageSchema['ports']): EcsTaskDefinitionAnchorImagePortSchema[] => value,
    options: { isSchema: { schema: EcsTaskDefinitionAnchorImagePortSchema } },
  })
  ports = Schema<EcsTaskDefinitionAnchorImagePortSchema[]>();

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
 * @group Anchors/EcsTaskDefinition
 *
 * @hideconstructor
 */
export class EcsTaskDefinitionAnchorPropertiesSchema {
  /**
   * The number of CPU units to reserve for the containers.
   */
  @Validate({ options: { minLength: 1 } })
  cpu = Schema<256 | 512 | 1024 | 2048 | 4096 | 8192 | 16384>();

  /**
   * Defines The containers to run as part of the task definition.
   * See {@link EcsTaskDefinitionAnchorImageSchema} for options.
   */
  @Validate({ options: { isSchema: { schema: EcsTaskDefinitionAnchorImageSchema } } })
  image = Schema<EcsTaskDefinitionAnchorImageSchema>();

  /**
   * The amount of memory to reserve for the containers.
   */
  @Validate({ options: { minLength: 1 } })
  memory = Schema<number>();
}

/**
 * This anchor is associated with a {@link Deployment} model representing an AWS ECS task definition.
 *
 * @group Anchors/EcsTaskDefinition
 *
 * @hideconstructor
 */
export class EcsTaskDefinitionAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Deployment;

  /**
   * Input properties.
   * See {@link EcsTaskDefinitionAnchorPropertiesSchema} for options.
   */
  @Validate({ options: { isSchema: { schema: EcsTaskDefinitionAnchorPropertiesSchema } } })
  override properties =
    Schema<{ [K in keyof EcsTaskDefinitionAnchorPropertiesSchema]: EcsTaskDefinitionAnchorPropertiesSchema[K] }>();
}
