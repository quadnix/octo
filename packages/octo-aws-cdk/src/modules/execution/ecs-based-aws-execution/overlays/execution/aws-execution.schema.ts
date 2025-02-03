import { BaseOverlaySchema, Schema, Validate } from '@quadnix/octo';

export class AwsExecutionOverlaySchema extends BaseOverlaySchema {
  @Validate({
    destruct: (value: AwsExecutionOverlaySchema['properties']): string[] => [
      value.deploymentTag,
      value.environmentName,
      value.executionId,
      value.regionId,
      value.serverKey,
      value.subnetId,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    deploymentTag: string;
    environmentName: string;
    executionId: string;
    regionId: string;
    serverKey: string;
    subnetId: string;
  }>();
}
