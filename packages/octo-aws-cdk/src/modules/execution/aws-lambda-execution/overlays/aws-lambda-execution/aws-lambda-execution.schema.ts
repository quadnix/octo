import { BaseOverlaySchema, Schema, Validate } from '@quadnix/octo';
import type { LambdaFunctionSchema } from '../../../../../resources/lambda-function/index.schema.js';

/**
 * @internal
 */
export class AwsLambdaExecutionOverlaySchema extends BaseOverlaySchema {
  @Validate({
    destruct: (value: AwsLambdaExecutionOverlaySchema['properties']): string[] => [
      value.deploymentContainerProperties.image.imageId,
      value.deploymentContainerProperties.image.imageTag,
      ...value.deploymentContainerProperties.imageCommand,
      String(value.deploymentContainerProperties.memoryInMegabytes),
      ...(value.deploymentContainerProperties.port ? [String(value.deploymentContainerProperties.port)] : []),
      String(value.deploymentContainerProperties.timeoutInSeconds),
      value.deploymentTag,
      value.environmentName,
      value.executionId,
      ...value.grants.dynamodb.flatMap((g) => [g.awsRegionId, g.tableName]),
      ...value.grants.s3.map((g) => g.bucketName),
      value.iamRoleName,
      value.invokeMode,
      value.serverKey,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    deploymentContainerProperties: Pick<
      LambdaFunctionSchema['properties'],
      'imageCommand' | 'memoryInMegabytes' | 'timeoutInSeconds'
    > & { image: { imageId: string; imageTag: string }; port: number | null };
    deploymentTag: string;
    environmentName: string;
    executionId: string;
    grants: {
      dynamodb: { allowRead: boolean; allowWrite: boolean; awsRegionId: string; tableName: string }[];
      s3: { accessPrefix: string; allowRead: boolean; allowWrite: boolean; bucketName: string }[];
    };
    iamRoleName: string;
    invokeMode: LambdaFunctionSchema['properties']['invokeMode'];
    serverKey: string;
  }>();
}
