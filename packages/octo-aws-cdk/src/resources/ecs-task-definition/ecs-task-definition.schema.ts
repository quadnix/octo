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
