import { BaseResourceSchema, Schema } from '@quadnix/octo';

export class EcsTaskDefinitionSchema extends BaseResourceSchema {
  override properties = Schema<{
    awsAccountId: string;
    awsRegionId: string;
    cpu: number;
    deploymentTag: string;
    environmentVariables: { name: string; value: string }[];
    image: {
      command: string[];
      ports: { containerPort: number; protocol: 'tcp' | 'udp' }[];
      uri: string;
    };
    memory: number;
    serverKey: string;
  }>();

  override response = Schema<{
    revision: number;
    taskDefinitionArn: string;
  }>();
}

export class EcsTaskDefinitionEfsSchema extends BaseResourceSchema {
  override properties = Schema<{
    filesystemName: string;
  }>();

  override response = Schema<{
    FileSystemId: string;
  }>();
}

export class EcsTaskDefinitionIamRoleSchema extends BaseResourceSchema {
  override response = Schema<{
    Arn: string;
  }>();
}
