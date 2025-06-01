import { BaseAnchorSchema, type Deployment, Schema, Validate } from '@quadnix/octo';

class EcsTaskDefinitionAnchorImagePortSchema {
  @Validate({ options: { minLength: 1 } })
  containerPort: number;

  @Validate({ options: { minLength: 1 } })
  protocol: 'tcp' | 'udp';
}

class EcsTaskDefinitionAnchorImageSchema {
  @Validate({ options: { minLength: 1 } })
  command: string;

  @Validate({
    destruct: (value: EcsTaskDefinitionAnchorImageSchema['ports']): EcsTaskDefinitionAnchorImagePortSchema[] => value,
    options: { isSchema: { schema: EcsTaskDefinitionAnchorImagePortSchema } },
  })
  ports: EcsTaskDefinitionAnchorImagePortSchema[];

  @Validate({ options: { minLength: 1 } })
  uri: string;
}

export class EcsTaskDefinitionAnchorPropertiesSchema {
  @Validate({ options: { minLength: 1 } })
  cpu: 256 | 512 | 1024 | 2048 | 4096 | 8192 | 16384;

  @Validate({ options: { isSchema: { schema: EcsTaskDefinitionAnchorImageSchema } } })
  image: EcsTaskDefinitionAnchorImageSchema;

  @Validate({ options: { minLength: 1 } })
  memory: number;
}

export class EcsTaskDefinitionAnchorSchema extends BaseAnchorSchema {
  parentInstance: Deployment;

  @Validate({ options: { isSchema: { schema: EcsTaskDefinitionAnchorPropertiesSchema } } })
  override properties =
    Schema<{ [K in keyof EcsTaskDefinitionAnchorPropertiesSchema]: EcsTaskDefinitionAnchorPropertiesSchema[K] }>();
}
