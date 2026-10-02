import { BaseOverlaySchema, Schema, type SubnetType, Validate } from '@quadnix/octo';
import {
  EcsTaskDefinitionImageSchema,
  EcsTaskDefinitionSchema,
} from '../../../../../resources/ecs-task-definition/index.schema.js';

/**
 * @internal
 */
export class AwsEcsExecutionOverlaySchema extends BaseOverlaySchema {
  @Validate<unknown>([
    {
      destruct: (value: AwsEcsExecutionOverlaySchema['properties']): EcsTaskDefinitionImageSchema[] =>
        value.deploymentContainerProperties.images,
      options: { isSchema: { schema: EcsTaskDefinitionImageSchema } },
    },
    {
      destruct: (value: AwsEcsExecutionOverlaySchema['properties']): string[] => [
        String(value.deploymentContainerProperties.cpu),
        String(value.deploymentContainerProperties.memory),
        value.deploymentTag,
        value.environmentName,
        value.executionId,
        ...value.filesystemNames,
        ...value.grants.dynamodb.map((g) => g.tableName),
        ...value.grants.s3.map((g) => g.bucketName),
        value.iamRoleName,
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
    filesystemNames: string[];
    grants: {
      dynamodb: { allowRead: boolean; allowWrite: boolean; tableName: string }[];
      s3: { accessPrefix: string; allowRead: boolean; allowWrite: boolean; bucketName: string }[];
    };
    iamRoleName: string;
    regionId: string;
    serverKey: string;
    subnetId: string;
    subnetType: SubnetType;
  }>();
}
