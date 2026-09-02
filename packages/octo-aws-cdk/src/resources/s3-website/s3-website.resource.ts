import {
  AResource,
  ATerraformResource,
  type BaseResourceSchema,
  Diff,
  DiffAction,
  DiffUtility,
  type MatchingResource,
  Resource,
  type TerraformModuleScope,
} from '@quadnix/octo';
import mime from 'mime';
import { PolicyUtility } from '../../utilities/policy/policy.utility.js';
import { S3WebsiteSchema, type WebsiteDistributionSchema } from './index.schema.js';

/**
 * @internal
 */
type IManifest = { [key: string]: { algorithm: 'sha1'; digest: string | 'deleted'; filePath: string } };

/**
 * @internal
 */
@Resource<S3Website>('@octo', 's3-website', S3WebsiteSchema)
export class S3Website extends ATerraformResource<S3WebsiteSchema, S3Website> {
  declare parents: MatchingResource<WebsiteDistributionSchema>[];
  declare properties: S3WebsiteSchema['properties'];
  declare response: S3WebsiteSchema['response'];
  private readonly manifest: IManifest = {};

  private sourcePathDigests: S3WebsiteSchema['sourcePathDigests'] = {};

  /**
   * @internal
   */
  constructor(
    resourceId: string,
    properties: S3WebsiteSchema['properties'],
    parents: MatchingResource<WebsiteDistributionSchema>[] = [],
  ) {
    super(resourceId, properties, parents);
  }

  /**
   * @internal
   */
  static override async unSynth<S extends BaseResourceSchema, T>(
    deserializationClass: any,
    resource: S,
    deReferenceResource: (context: string) => Promise<AResource<BaseResourceSchema, any>>,
  ): Promise<T> {
    const s3Website = (await super.unSynth(deserializationClass, resource, deReferenceResource)) as S3Website;
    const digests = (resource as unknown as S3WebsiteSchema).sourcePathDigests;
    s3Website.sourcePathDigests = digests ? { ...digests } : {};
    return s3Website as T;
  }

  /**
   * Admits one CloudFront distribution to this bucket.
   *
   * The grant is a statement in the policy this bucket already owns, rather than a policy of the
   * distribution's own: `aws_s3_bucket_policy` writes a bucket's whole policy, so two of them
   * pointed at one bucket would take turns overwriting each other. Adding a statement leaves every
   * other statement alone, and dropping a distribution drops only its own.
   *
   * The statement names the distribution by ARN, which AWS assigns, so this bucket becomes the
   * distribution's child and reads it as a reference. The distribution does not reference the bucket
   * back - it writes this bucket's hostname down instead - because two folders referencing each
   * other is a cycle terragrunt cannot order.
   *
   * @internal
   */
  addCloudFrontAccess(distribution: MatchingResource<WebsiteDistributionSchema>): void {
    const distributionResourceId = distribution.getActual().resourceId;
    if (this.properties.distributionResourceIds.includes(distributionResourceId)) {
      return;
    }

    const { childToParentDependency, parentToChildDependency } = distribution.addChild(
      'resourceId',
      this,
      'resourceId',
    );
    childToParentDependency.addBehavior('update-cloudfront-access', DiffAction.UPDATE, 'resourceId', DiffAction.ADD);
    parentToChildDependency.addBehavior('resourceId', DiffAction.DELETE, 'update-cloudfront-access', DiffAction.UPDATE);

    this.properties.distributionResourceIds.push(distributionResourceId);
  }

  /**
   * @internal
   */
  override async diffProperties(previous: S3Website): Promise<Diff[]> {
    if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties, ['distributionResourceIds'])) {
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

    // Putting a distribution in front of the bucket, or taking one away, rewrites how the bucket is
    // reached and who may read it, without touching the bucket itself.
    if (
      !DiffUtility.isObjectDeepEquals(
        { distributionResourceIds: [...previous.properties.distributionResourceIds].sort() },
        { distributionResourceIds: [...this.properties.distributionResourceIds].sort() },
      )
    ) {
      diffs.push(
        new Diff(this, DiffAction.UPDATE, 'update-cloudfront-access', [...this.properties.distributionResourceIds]),
      );
    }

    // Only propose a content update when the digests differ from what was last committed.
    if (!DiffUtility.isObjectDeepEquals(previous.sourcePathDigests, this.sourcePathDigests)) {
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

  /**
   * @internal
   */
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

  /**
   * @internal
   */
  override synth(): S3WebsiteSchema {
    return {
      ...super.synth(),
      sourcePathDigests: JSON.parse(JSON.stringify(this.sourcePathDigests)),
    };
  }

  /**
   * @internal
   */
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
      RegionalDomainName: terraform.raw(`${s3WebsiteTFResource.address}.bucket_regional_domain_name`),
    });

    // A bucket with nothing in front of it is reached directly, and a bucket with a distribution in
    // front of it is reached through that. There is no third way, and no separate input saying so.
    const isPublic = this.properties.distributionResourceIds.length === 0;

    // A website endpoint is reachable only over plain HTTP and only from a public bucket, so it is
    // emitted for a public bucket alone. Behind a distribution the same two documents are served
    // through its root object and error responses.
    if (isPublic) {
      s3WebsiteOctoResource.addTerraformResource(
        'aws_s3_bucket_website_configuration',
        `${this.resourceId}_website_bucket_config`,
        {
          bucket: terraform.raw(`${s3WebsiteTFResource.address}.id`),
          error_document: { key: this.properties.ErrorDocument },
          index_document: { suffix: this.properties.IndexDocument },
        },
      );
    }

    s3WebsiteOctoResource.addTerraformResource(
      'aws_s3_bucket_public_access_block',
      `${this.resourceId}_website_bucket_public_access`,
      {
        block_public_acls: !isPublic,
        block_public_policy: !isPublic,
        bucket: terraform.raw(`${s3WebsiteTFResource.address}.id`),
        ignore_public_acls: !isPublic,
        restrict_public_buckets: !isPublic,
      },
    );

    // One policy, whatever is reading the bucket. A public bucket is one anonymous statement; a
    // closed one is a statement per distribution, each naming that distribution alone, so no other
    // distribution can read the bucket by pointing at it.
    const statements = isPublic
      ? [
          {
            Action: ['s3:GetObject'],
            Effect: 'Allow',
            Principal: '*',
            Resource: [terraform.raw(`"\${${s3WebsiteTFResource.address}.arn}/*"`)],
            Sid: PolicyUtility.getSafeSid('PublicReadGetObject'),
          },
        ]
      : this.properties.distributionResourceIds.map((distributionResourceId) => {
          const distribution = this.parents.find((p) => p.getActual().resourceId === distributionResourceId)!;

          return {
            Action: ['s3:GetObject'],
            Condition: {
              StringEquals: {
                'AWS:SourceArn': terraform.getRef(distribution, 'Arn'),
              },
            },
            Effect: 'Allow',
            Principal: { Service: 'cloudfront.amazonaws.com' },
            Resource: [terraform.raw(`"\${${s3WebsiteTFResource.address}.arn}/*"`)],
            Sid: PolicyUtility.getSafeSid(`AllowCloudFrontRead-${distributionResourceId}`),
          };
        });

    s3WebsiteOctoResource.addTerraformResource('aws_s3_bucket_policy', `${this.resourceId}_website_bucket_policy`, {
      bucket: terraform.raw(`${s3WebsiteTFResource.address}.id`),
      policy: terraform.jsonencode({ Statement: statements, Version: '2012-10-17' }),
    });

    for (const [remotePath, { digest, filePath }] of Object.entries(this.manifest)) {
      if (digest === 'deleted') {
        continue;
      }

      const safeLabel = PolicyUtility.getSafeSid(remotePath);
      const contentType = mime.getType(remotePath) ?? 'application/octet-stream';
      const sourceHcl = terraform.localPath(filePath);
      s3WebsiteOctoResource.addTerraformResource('aws_s3_object', `${this.resourceId}_file_${safeLabel}`, {
        bucket: terraform.raw(`${s3WebsiteTFResource.address}.id`),
        content_type: contentType,
        etag: terraform.raw(`filemd5(${sourceHcl})`),
        key: remotePath,
        source: terraform.raw(sourceHcl),
      });
    }

    if (Object.keys(this.tags).length > 0) {
      s3WebsiteTFResource.attribute('tags', this.tags);
    }
  }

  /**
   * @internal
   */
  updateManifest(manifestDiff: IManifest): void {
    for (const key of Object.keys(manifestDiff)) {
      this.manifest[key] = { ...manifestDiff[key] };

      if (manifestDiff[key].digest === 'deleted') {
        delete this.sourcePathDigests[key];
      } else {
        this.sourcePathDigests[key] = manifestDiff[key].digest;
      }
    }
  }
}
