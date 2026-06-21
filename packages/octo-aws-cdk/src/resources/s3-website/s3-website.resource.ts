import { ATerraformResource, Diff, DiffAction, DiffUtility, Resource, type TerraformModuleScope } from '@quadnix/octo';
import mime from 'mime';
import { PolicyUtility } from '../../utilities/policy/policy.utility.js';
import { S3WebsiteSchema } from './index.schema.js';

/**
 * @internal
 */
type IManifest = { [key: string]: { algorithm: 'sha1'; digest: string | 'deleted'; filePath: string } };

/**
 * @internal
 */
@Resource<S3Website>('@octo', 's3-website', S3WebsiteSchema)
export class S3Website extends ATerraformResource<S3WebsiteSchema, S3Website> {
  declare properties: S3WebsiteSchema['properties'];
  declare response: S3WebsiteSchema['response'];

  private readonly manifest: IManifest = {};

  constructor(resourceId: string, properties: S3WebsiteSchema['properties']) {
    super(resourceId, properties, []);
  }

  override async diffProperties(previous: S3Website): Promise<Diff[]> {
    if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties)) {
      return [
        new Diff(
          this,
          DiffAction.REPLACE,
          'resourceId',
          this.getContext(),
          'Bucket is force-new on aws_s3_bucket; a change recreates the bucket',
        ),
      ];
    }

    const diffs: Diff[] = [];

    if (this.manifest && Object.keys(this.manifest).length > 0) {
      diffs.push(
        new Diff<any, IManifest>(
          this,
          DiffAction.UPDATE,
          'update-source-paths',
          JSON.parse(JSON.stringify(this.manifest)),
        ),
      );
    }

    return diffs;
  }

  override diffUnpack(diff: Diff): Diff[] {
    if (diff.action === DiffAction.ADD && diff.field === 'resourceId') {
      const diffs: Diff[] = [diff];

      if (this.manifest && Object.keys(this.manifest).length > 0) {
        diffs.push(
          new Diff<any, IManifest>(
            this,
            DiffAction.UPDATE,
            'update-source-paths',
            JSON.parse(JSON.stringify(this.manifest)),
          ),
        );
      }

      return diffs;
    } else {
      return [diff];
    }
  }

  override async toHCL(terraform: TerraformModuleScope): Promise<void> {
    const s3WebsiteOctoResource = terraform.addOctoTerraformResource(this as S3Website, {
      provider: { accountId: this.properties.awsAccountId, regionId: this.properties.awsRegionId },
    });

    const s3WebsiteTFResource = s3WebsiteOctoResource.addTerraformResource(
      'aws_s3_bucket',
      `${this.resourceId}_website_bucket`,
      { bucket: this.properties.Bucket },
    );
    s3WebsiteOctoResource.output({
      Arn: terraform.raw(`${s3WebsiteTFResource.address}.arn`),
      awsRegionId: this.properties.awsRegionId,
    });

    s3WebsiteOctoResource.addTerraformResource(
      'aws_s3_bucket_website_configuration',
      `${this.resourceId}_website_bucket_config`,
      {
        bucket: terraform.raw(`${s3WebsiteTFResource.address}.id`),
        error_document: { key: this.properties.ErrorDocument },
        index_document: { suffix: this.properties.IndexDocument },
      },
    );
    s3WebsiteOctoResource.addTerraformResource(
      'aws_s3_bucket_public_access_block',
      `${this.resourceId}_website_bucket_public_access`,
      {
        block_public_acls: false,
        block_public_policy: false,
        bucket: terraform.raw(`${s3WebsiteTFResource.address}.id`),
        ignore_public_acls: false,
        restrict_public_buckets: false,
      },
    );
    s3WebsiteOctoResource.addTerraformResource(
      'aws_s3_bucket_policy',
      `${this.resourceId}_website_bucket_public_read_policy`,
      {
        bucket: terraform.raw(`${s3WebsiteTFResource.address}.id`),
        policy: terraform.jsonencode({
          Statement: [
            {
              Action: ['s3:GetObject'],
              Effect: 'Allow',
              Principal: '*',
              Resource: [terraform.raw(`"\${${s3WebsiteTFResource.address}.arn}/*"`)],
              Sid: PolicyUtility.getSafeSid('PublicReadGetObject'),
            },
          ],
          Version: '2012-10-17',
        }),
      },
    );

    for (const [remotePath, { digest, filePath }] of Object.entries(this.manifest)) {
      if (digest === 'deleted') {
        continue;
      }

      const safeLabel = PolicyUtility.getSafeSid(remotePath);
      const contentType = mime.getType(remotePath) ?? 'application/octet-stream';
      s3WebsiteOctoResource.addTerraformResource('aws_s3_object', `${this.resourceId}_file_${safeLabel}`, {
        bucket: terraform.raw(`${s3WebsiteTFResource.address}.id`),
        content_type: contentType,
        etag: terraform.raw(`filemd5(${JSON.stringify(filePath)})`),
        key: remotePath,
        source: filePath,
      });
    }

    if (Object.keys(this.tags).length > 0) {
      s3WebsiteTFResource.attribute('tags', this.tags);
    }
  }

  updateManifest(manifestDiff: IManifest): void {
    for (const key of Object.keys(manifestDiff)) {
      this.manifest[key] = { ...manifestDiff[key] };
    }
  }
}
