import { DeleteBucketCommand, DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { Diff, DiffAction, IResourceAction } from '@quadnix/octo';
import { AwsRegion } from '../../../../models/region/aws.region.model.js';
import { IS3WebsiteProperties, IS3WebsiteReplicationMetadata, IS3WebsiteResponse } from '../s3-website.interface.js';
import { S3Website } from '../s3-website.resource.js';

export class DeleteS3WebsiteAction implements IResourceAction {
  readonly ACTION_NAME: string = 'DeleteS3WebsiteAction';

  constructor(private readonly s3Client: S3Client, private readonly region: AwsRegion) {}

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 's3-website';
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const s3Website = diff.model as S3Website;
    const properties = s3Website.properties as unknown as IS3WebsiteProperties;
    const response = s3Website.response as unknown as IS3WebsiteResponse;

    const s3WebsiteReplicationMetadata: IS3WebsiteReplicationMetadata =
      (response?.replicationsStringified as string)?.length > 0
        ? JSON.parse(response.replicationsStringified as string)
        : {};

    // Skip processing the action if current AWS region is not the same region hosting this S3 website.
    if (this.region.nativeAwsRegionId !== s3WebsiteReplicationMetadata?.awsRegionId) {
      return;
    }

    // Delete objects.
    let ContinuationToken: string | undefined = undefined;
    do {
      const data = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: properties.Bucket,
          ContinuationToken,
          MaxKeys: 1000,
        }),
      );

      await this.s3Client.send(
        new DeleteObjectsCommand({
          Bucket: properties.Bucket,
          Delete: {
            Objects: data.Contents?.map((l) => ({ Key: l.Key })),
            Quiet: true,
          },
        }),
      );

      ContinuationToken = data.NextContinuationToken;
    } while (ContinuationToken);

    // Delete bucket.
    await this.s3Client.send(
      new DeleteBucketCommand({
        Bucket: properties.Bucket,
      }),
    );

    // Set response.
    response.replicationsStringified = JSON.stringify({});
  }
}
