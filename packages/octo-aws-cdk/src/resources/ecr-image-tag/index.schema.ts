import { BaseResourceSchema, Schema, Validate } from '@quadnix/octo';

/**
 * The `EcrImageTagSchema` class is the schema for the `EcrImageTag` resource,
 * which represents one container image published into an AWS Elastic Container Registry repository.
 *
 * Terraform provisions no part of it. There is no managed resource in the AWS provider that puts an
 * image into a registry, so this is an external resource: octo builds the image with the local
 * docker CLI and pushes it through the ECR API itself. A push writes the tag once, because
 * {@link DockerService} builds an image as a single manifest.
 *
 * @group Resources/EcrImageTag
 *
 * @hideconstructor
 *
 * @overrideProperty parents - The {@link EcrImageSchema} repository the image is published into.
 * @overrideProperty resourceId - The resource id is of format `ecr-image-tag-<region-id>-<image-id>-<image-tag>`.
 * The tag is part of the identity, so publishing another one is a new resource rather than a change
 * to this one. Nothing else about a published image is a change: two resources sharing an id are
 * the same image, and the tag it sits under cannot be written twice.
 */
export class EcrImageTagSchema extends BaseResourceSchema {
  /**
   * Input properties.
   * * `properties.architecture` - The processor the image is built for. A runtime reads it to run the
   * image on the same processor. Like the build context, changing it publishes nothing; publish a new
   * tag instead.
   * * `properties.awsAccountId` - The AWS account ID.
   * * `properties.awsRegionId` - The AWS region ID.
   * * `properties.dockerfileDirectory` - The build context, as a path relative to the octo project
   * root. It is relative because an absolute path differs on every machine, and this path is part of
   * what octo commits. It says how the image was built rather than what it is, so moving it
   * publishes nothing; publish a new tag instead.
   * * `properties.dockerfileName` - The name of the Dockerfile within `dockerfileDirectory`. Like
   * the directory, it is a build instruction rather than part of the image's identity.
   * * `properties.imageId` - The name of the ECR repository, e.g. `quadnix/nginx`.
   * * `properties.imageTag` - The tag to publish the image under. The repository's tags are
   * immutable, so new content is published under a new tag rather than over an existing one.
   */
  @Validate<unknown>([
    {
      destruct: (value: EcrImageTagSchema['properties']): string[] => [
        value.architecture,
        value.awsAccountId,
        value.awsRegionId,
        value.dockerfileDirectory,
        value.dockerfileName,
        value.imageId,
        value.imageTag,
      ],
      options: { minLength: 1 },
    },
    {
      destruct: (value: EcrImageTagSchema['properties']): string[] => [value.architecture],
      options: { regex: /^(arm64|x86_64)$/ },
    },
  ])
  override properties = Schema<{
    architecture: 'arm64' | 'x86_64';
    awsAccountId: string;
    awsRegionId: string;
    dockerfileDirectory: string;
    dockerfileName: string;
    imageId: string;
    imageTag: string;
  }>();

  /**
   * Saved response.
   * * `response.imageDigest` - The content digest AWS assigned the pushed image.
   * * `response.imageTag` - The tag the image was published under.
   * * `response.imageUri` - The full `<uri>:<tag>` reference, which is what a container definition runs.
   * * `response.registryId` - The AWS account ID of the registry holding the repository.
   * * `response.repositoryName` - The name of the repository the image was published into.
   */
  @Validate({
    destruct: (value: EcrImageTagSchema['response']): string[] => {
      const subjects: string[] = [];
      if (value.imageDigest) {
        subjects.push(value.imageDigest);
      }
      if (value.imageTag) {
        subjects.push(value.imageTag);
      }
      if (value.imageUri) {
        subjects.push(value.imageUri);
      }
      if (value.registryId) {
        subjects.push(value.registryId);
      }
      if (value.repositoryName) {
        subjects.push(value.repositoryName);
      }
      return subjects;
    },
    options: { minLength: 1 },
  })
  override response = Schema<{
    imageDigest?: string;
    imageTag?: string;
    imageUri?: string;
    registryId?: string;
    repositoryName?: string;
  }>({
    imageDigest: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    imageTag: 'mock-tag',
    imageUri: '000000000000.dkr.ecr.us-east-1.amazonaws.com/mock-repository:mock-tag',
    registryId: '000000000000',
    repositoryName: 'mock-repository',
  });
}
