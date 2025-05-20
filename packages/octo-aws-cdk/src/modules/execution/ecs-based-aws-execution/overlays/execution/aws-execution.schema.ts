import { BaseOverlaySchema, Schema, type SubnetType, Validate } from '@quadnix/octo';

export class AwsExecutionOverlayDeploymentContainerPropertiesSchema {
  @Validate({ destruct: (value: number | null): number[] => (value ? [value] : []), options: { minLength: 1 } })
  cpu?: (256 | 512 | 1024 | 2048 | 4096 | 8192 | 16384) | null = Schema(null);

  @Validate({
    destruct: (value: {
      command?: string;
      ports?: {
        containerPort: number;
        protocol: 'tcp' | 'udp';
      }[];
    }): (string | number)[] => {
      const values: (string | number)[] = [];
      if (value.command) {
        values.push(value.command);
      }
      for (const portMapping of value.ports || []) {
        values.push(portMapping.containerPort, portMapping.protocol);
      }
      return values;
    },
    options: { minLength: 1 },
  })
  image?: {
    command?: string;
    ports?: {
      containerPort: number;
      protocol: 'tcp' | 'udp';
    }[];
  } = Schema({});

  @Validate({ destruct: (value: number | null): number[] => (value ? [value] : []), options: { minLength: 1 } })
  memory?: number | null = Schema(null);
}

export class AwsExecutionOverlaySchema extends BaseOverlaySchema {
  @Validate<unknown>([
    {
      destruct: (
        value: AwsExecutionOverlaySchema['properties'],
      ): AwsExecutionOverlayDeploymentContainerPropertiesSchema[] =>
        Object.keys(value.deploymentContainerProperties).length > 0 ? [value.deploymentContainerProperties] : [],
      options: { isSchema: { schema: AwsExecutionOverlayDeploymentContainerPropertiesSchema } },
    },
    {
      destruct: (value: AwsExecutionOverlaySchema['properties']): string[] => [
        value.deploymentTag,
        value.environmentName,
        value.executionId,
        value.regionId,
        value.serverKey,
        value.subnetId,
        value.subnetType,
      ],
      options: { minLength: 1 },
    },
  ])
  override properties = Schema<{
    deploymentContainerProperties: AwsExecutionOverlayDeploymentContainerPropertiesSchema;
    deploymentTag: string;
    environmentName: string;
    executionId: string;
    regionId: string;
    serverKey: string;
    subnetId: string;
    subnetType: SubnetType;
  }>();
}
