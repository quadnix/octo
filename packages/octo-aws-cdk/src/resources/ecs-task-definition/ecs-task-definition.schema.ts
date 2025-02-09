import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

class EcsTaskDefinitionEnvironmentVariableSchema {
  @Validate({ options: { minLength: 1 } })
  name: string;

  @Validate({ options: { minLength: 1 } })
  value: string;
}

class EcsTaskDefinitionImagePortSchema {
  @Validate({ options: { minLength: 1 } })
  containerPort: number;

  @Validate({ options: { minLength: 1 } })
  protocol: 'tcp' | 'udp';
}

class EcsTaskDefinitionImageSchema {
  @Validate({ options: { minLength: 1 } })
  command: string[];

  @Validate({
    destruct: (value: EcsTaskDefinitionImageSchema['ports']): EcsTaskDefinitionImagePortSchema[] => value,
    options: { isSchema: { schema: EcsTaskDefinitionImagePortSchema } },
  })
  ports: EcsTaskDefinitionImagePortSchema[];

  @Validate({ options: { minLength: 1 } })
  uri: string;
}

export class EcsTaskDefinitionSchema extends BaseResourceSchema {
  @Validate<unknown>([
    {
      destruct: (value: EcsTaskDefinitionSchema['properties']): string[] => [
        value.awsAccountId,
        value.awsRegionId,
        String(value.cpu),
        value.deploymentTag,
        String(value.memory),
        value.serverKey,
      ],
      options: { minLength: 1 },
    },
    {
      destruct: (value: EcsTaskDefinitionSchema['properties']): EcsTaskDefinitionEnvironmentVariableSchema[] =>
        value.environmentVariables,
      options: { isSchema: { schema: EcsTaskDefinitionEnvironmentVariableSchema } },
    },
    {
      destruct: (value: EcsTaskDefinitionSchema['properties']): EcsTaskDefinitionImageSchema[] => [value.image],
      options: { isSchema: { schema: EcsTaskDefinitionImageSchema } },
    },
  ])
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
    cpu: number;
    deploymentTag: string;
    environmentVariables: EcsTaskDefinitionEnvironmentVariableSchema[];
    image: EcsTaskDefinitionImageSchema;
    memory: number;
    serverKey: string;
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
    revision: number;
    taskDefinitionArn: string;
  }>();
}
