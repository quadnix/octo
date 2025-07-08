import { BaseAnchorSchema, type Deployment, Schema, Validate } from '@quadnix/octo';

class EcsTaskDefinitionAnchorImagePortSchema {
  @Validate({ options: { minLength: 1 } })
  containerPort = Schema<number>();

  @Validate({ options: { minLength: 1 } })
  protocol = Schema<'tcp' | 'udp'>();
}

class EcsTaskDefinitionAnchorImageSchema {
  @Validate({ options: { minLength: 1 } })
  command = Schema<string>();

  @Validate({
    destruct: (value: EcsTaskDefinitionAnchorImageSchema['ports']): EcsTaskDefinitionAnchorImagePortSchema[] => value,
    options: { isSchema: { schema: EcsTaskDefinitionAnchorImagePortSchema } },
  })
  ports = Schema<EcsTaskDefinitionAnchorImagePortSchema[]>();

  @Validate({ options: { minLength: 1 } })
  uri = Schema<string>();
}

export class EcsTaskDefinitionAnchorPropertiesSchema {
  @Validate({ options: { minLength: 1 } })
  cpu = Schema<256 | 512 | 1024 | 2048 | 4096 | 8192 | 16384>();

  @Validate({ options: { isSchema: { schema: EcsTaskDefinitionAnchorImageSchema } } })
  image = Schema<EcsTaskDefinitionAnchorImageSchema>();

  @Validate({ options: { minLength: 1 } })
  memory = Schema<number>();
}

/**
 * @group Anchors/EcsTaskDefinition
 *
 * @hideconstructor
 */
export class EcsTaskDefinitionAnchorSchema extends BaseAnchorSchema {
  /**
   * @private
   */
  parentInstance: Deployment;

  @Validate({ options: { isSchema: { schema: EcsTaskDefinitionAnchorPropertiesSchema } } })
  override properties =
    Schema<{ [K in keyof EcsTaskDefinitionAnchorPropertiesSchema]: EcsTaskDefinitionAnchorPropertiesSchema[K] }>();
}
