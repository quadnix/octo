import { type AResource, BaseResourceSchema, Schema } from '@quadnix/octo';

export class EcsTaskDefinitionSchema extends BaseResourceSchema {
  override properties = Schema<{
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

class EcsTaskDefinitionEfsSchema extends BaseResourceSchema {
  override properties = Schema<{
    filesystemName: string;
  }>();

  override response = Schema<{
    FileSystemId: string;
  }>();
}
export type EcsTaskDefinitionEfs = AResource<EcsTaskDefinitionEfsSchema, any>;

class EcsTaskDefinitionIamRoleSchema extends BaseResourceSchema {
  override response = Schema<{
    Arn: string;
  }>();
}
export type EcsTaskDefinitionIamRole = AResource<EcsTaskDefinitionIamRoleSchema, any>;
