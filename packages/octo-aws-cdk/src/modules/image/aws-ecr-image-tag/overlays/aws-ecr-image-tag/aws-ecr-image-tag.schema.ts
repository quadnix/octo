import { BaseOverlaySchema, Schema, Validate } from '@quadnix/octo';

/**
 * @internal
 */
export class AwsEcrImageTagOverlaySchema extends BaseOverlaySchema {
  @Validate({
    destruct: (value: AwsEcrImageTagOverlaySchema['properties']): string[] => [
      value.dockerfileDirectory,
      value.dockerfileName,
      value.imageId,
      value.imageTag,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    dockerfileDirectory: string;
    dockerfileName: string;
    imageId: string;
    imageTag: string;
  }>();
}
