import { BaseOverlaySchema, Schema, Validate } from '@quadnix/octo';

/**
 * @internal
 */
export class AwsDeploymentImageOverlaySchema extends BaseOverlaySchema {
  @Validate({
    destruct: (value: AwsDeploymentImageOverlaySchema['properties']): string[] => [
      value.deploymentTag,
      value.imageId,
      value.imageTag,
      value.serverKey,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    deploymentTag: string;
    imageId: string;
    imageTag: string;
    serverKey: string;
  }>();
}
