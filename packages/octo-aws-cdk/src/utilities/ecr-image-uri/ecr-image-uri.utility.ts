/**
 * The repository and tag an ECR image URI names.
 *
 * @internal
 */
const ECR_IMAGE_URI =
  /^(?<awsAccountId>\d+)\.dkr\.ecr\.(?<awsRegionId>[a-z0-9-]+)\.amazonaws\.com\/(?<imageId>[\w-./]+):(?<imageTag>[\w-.]+)$/;

/**
 * Reads what a container image URI names.
 *
 * @internal
 */
export class EcrImageUriUtility {
  /**
   * Splits an ECR image URI into the repository and tag it addresses.
   *
   * @param uri The URI a container definition runs, which is as likely to name docker hub or any
   * other registry as it is to name ECR.
   * @returns The repository and tag, or `undefined` when the URI does not address ECR.
   */
  static parse(
    uri: string,
  ): { awsAccountId: string; awsRegionId: string; imageId: string; imageTag: string } | undefined {
    const groups = ECR_IMAGE_URI.exec(uri)?.groups;
    if (!groups) {
      return undefined;
    }

    return {
      awsAccountId: groups.awsAccountId,
      awsRegionId: groups.awsRegionId,
      imageId: groups.imageId,
      imageTag: groups.imageTag,
    };
  }
}
