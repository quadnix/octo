import { type Image, ImageSchema, Schema, Validate } from '@quadnix/octo';
import { AwsEcrImageAnchorSchema } from '../../../anchors/aws-ecr/aws-ecr-image.anchor.schema.js';

/**
 * `AwsEcrImageTagModuleSchema` is the input schema for the `AwsEcrImageTagModule` module.
 * This schema defines the image to publish, the tag to publish it under, and the ECR image whose
 * repositories it is published into.
 *
 * @group Modules/Image/AwsEcrImageTag
 *
 * @hideconstructor
 *
 * @see {@link AwsEcrImageTagModule} to learn more about the `AwsEcrImageTagModule` module.
 */
export class AwsEcrImageTagModuleSchema {
  /**
   * The processor the image is built for. A Lambda function or an ECS task running the image runs on it.
   * Like `dockerfileDirectory`, editing it republishes nothing.
   */
  @Validate({ options: { regex: /^(arm64|x86_64)$/ } })
  architecture = Schema<'arm64' | 'x86_64'>();

  /**
   * The build context the image is built from, as a path relative to the octo project root.
   * It is relative because an absolute path differs on every machine, and this path is part of what
   * octo commits.
   *
   * It describes how to build the image, not which image this is. Editing it - or the Dockerfile it
   * points at - republishes nothing, because the tag already published is immutable. Publish the new
   * image under a new tag.
   */
  @Validate({ options: { minLength: 1 } })
  dockerfileDirectory = Schema<string>();

  /**
   * The name of the Dockerfile within `dockerfileDirectory`.
   * Like `dockerfileDirectory`, editing it republishes nothing.
   */
  @Validate({ options: { minLength: 1 } })
  dockerfileName? = Schema<string>('Dockerfile');

  /**
   * The image whose repositories this version is published into.
   * The image must have an AWS ECR image anchor configured, and the version is published into every
   * repository the image has, i.e. into each of its regions.
   */
  @Validate([
    {
      options: {
        isModel: { anchors: [{ schema: AwsEcrImageAnchorSchema }], NODE_NAME: 'image' },
      },
    },
    {
      destruct: (value: AwsEcrImageTagModuleSchema['image']): [ImageSchema] => [value.synth()],
      options: {
        isSchema: { schema: ImageSchema },
      },
    },
  ])
  image = Schema<Image>();

  /**
   * The tag this version of the image is published under, e.g. `0.0.1`.
   * Tags are immutable: another version is another tag, published by another module. This is the
   * only input that decides what is published - changing it publishes the new tag and retires the
   * old one.
   */
  @Validate({ options: { minLength: 1 } })
  imageTag = Schema<string>();
}
