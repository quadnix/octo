import { BaseOverlaySchema, Schema, type SubnetType, Validate } from '@quadnix/octo';
import {
  EcsTaskDefinitionImageSchema,
  EcsTaskDefinitionSchema,
} from '../../../../../resources/ecs-task-definition/index.schema.js';

export class AwsExecutionOverlaySchema extends BaseOverlaySchema {
  @Validate<unknown>([
    {
      destruct: (value: AwsExecutionOverlaySchema['properties']): EcsTaskDefinitionImageSchema[] =>
        value.deploymentContainerProperties.images,
      options: { isSchema: { schema: EcsTaskDefinitionImageSchema } },
    },
    {
      destruct: (value: AwsExecutionOverlaySchema['properties']): string[] => [
        String(value.deploymentContainerProperties.cpu),
        String(value.deploymentContainerProperties.memory),
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
    deploymentContainerProperties: Pick<EcsTaskDefinitionSchema['properties'], 'cpu' | 'images' | 'memory'>;
    deploymentTag: string;
    environmentName: string;
    executionId: string;
    regionId: string;
    serverKey: string;
    subnetId: string;
    subnetType: SubnetType;
  }>();
}
