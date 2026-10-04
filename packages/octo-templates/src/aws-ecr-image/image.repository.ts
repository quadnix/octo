import { DescribeImagesCommand, DescribeRepositoriesCommand, ECRClient } from '@aws-sdk/client-ecr';

/**
 * Reads the ECR repository this template provisions, so the e2e can prove the image was actually
 * published and not merely recorded as published.
 */
export class ImageRepository {
  private readonly client: ECRClient;

  /**
   * @param region The AWS region to read, e.g. `us-east-1`.
   * @param endpoint Address of an AWS-compatible service, e.g. a localstack container. Defaults to AWS.
   */
  constructor(region: string, endpoint?: string) {
    this.client = new ECRClient({ endpoint, region });
  }

  /**
   * Returns the content digest of the image published under the given tag, or `null` when the
   * repository holds no such image, or no longer exists at all.
   */
  async getImageDigest(repositoryName: string, imageTag: string): Promise<string | null> {
    try {
      const { imageDetails } = await this.client.send(
        new DescribeImagesCommand({ imageIds: [{ imageTag }], repositoryName }),
      );
      return imageDetails?.[0]?.imageDigest ?? null;
    } catch (error) {
      if (error.name === 'RepositoryNotFoundException' || error.name === 'ImageNotFoundException') {
        return null;
      }
      throw error;
    }
  }

  /**
   * When the image under the given tag was last pushed, or `null` when there is no such image. A
   * republish moves it, which is how the e2e tells one push from two.
   */
  async getImagePushedAt(repositoryName: string, imageTag: string): Promise<number | null> {
    try {
      const { imageDetails } = await this.client.send(
        new DescribeImagesCommand({ imageIds: [{ imageTag }], repositoryName }),
      );
      const imagePushedAt = imageDetails?.[0]?.imagePushedAt;
      return imagePushedAt ? imagePushedAt.getTime() : null;
    } catch (error) {
      if (error.name === 'RepositoryNotFoundException' || error.name === 'ImageNotFoundException') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Whether AWS still knows the repository.
   */
  async hasRepository(repositoryName: string): Promise<boolean> {
    try {
      await this.client.send(new DescribeRepositoriesCommand({ repositoryNames: [repositoryName] }));
      return true;
    } catch (error) {
      if (error.name === 'RepositoryNotFoundException') {
        return false;
      }
      throw error;
    }
  }
}
