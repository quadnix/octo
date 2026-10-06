import { BaseOverlaySchema, Schema, Validate } from '@quadnix/octo';
import type { EcrImageTagSchema } from '../../../../../resources/ecr-image-tag/index.schema.js';

/**
 * @internal
 */
export class AwsEcrImageTagOverlaySchema extends BaseOverlaySchema {
  @Validate({
    destruct: (value: AwsEcrImageTagOverlaySchema['properties']): string[] => [
      value.architecture,
      value.dockerfileDirectory,
      value.dockerfileName,
      value.imageId,
      value.imageTag,
    ],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    architecture: 'arm64' | 'x86_64';
    buildArguments: EcrImageTagSchema['properties']['buildArguments'];
    buildSecrets: EcrImageTagSchema['properties']['buildSecrets'];
    dockerfileDirectory: string;
    dockerfileName: string;
    imageId: string;
    imageTag: string;
  }>();
}
