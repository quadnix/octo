import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

export class EcsTaskDefinitionEnvironmentVariableSchema {
  @Validate({ options: { minLength: 1 } })
  name = Schema<string>();

  @Validate({ options: { minLength: 1 } })
  value = Schema<string>();
}

export class EcsTaskDefinitionImagePortSchema {
  @Validate({ options: { minLength: 1 } })
  containerPort = Schema<number>();

  @Validate({ options: { minLength: 1 } })
  protocol = Schema<'tcp' | 'udp'>();
}

export class EcsTaskDefinitionImageSchema {
  @Validate({ options: { minLength: 1 } })
  command = Schema<string[]>();

  @Validate({ options: { minLength: 1 } })
  essential = Schema<boolean>();

  @Validate({ options: { minLength: 1 } })
  name = Schema<string>();

  @Validate({
    destruct: (value: EcsTaskDefinitionImageSchema['ports']): EcsTaskDefinitionImagePortSchema[] => value,
    options: { isSchema: { schema: EcsTaskDefinitionImagePortSchema } },
  })
  ports = Schema<EcsTaskDefinitionImagePortSchema[]>();

  @Validate({ options: { minLength: 1 } })
  uri = Schema<string>();
}

/**
 * @group Resources/EcsTaskDefinition
 *
 * @hideconstructor
 */
export class EcsTaskDefinitionSchema extends BaseResourceSchema {
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
