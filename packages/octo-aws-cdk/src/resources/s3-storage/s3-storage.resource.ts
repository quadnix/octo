import {
  AResource,
  ATerraformResource,
  type BaseResourceSchema,
  DependencyRelationship,
  Diff,
  DiffAction,
  DiffUtility,
  MatchingResource,
  Resource,
  ResourceError,
  type TerraformModuleScope,
} from '@quadnix/octo';
import mime from 'mime';
import { PolicyUtility } from '../../utilities/policy/policy.utility.js';
import type { IManifest } from '../../utilities/s3-file-source/s3-file-source.utility.js';
import { type IS3StoragePrincipalType, type PrincipalResourceSchema, S3StorageSchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<S3Storage>('@octo', 's3-storage', S3StorageSchema, {
  destroyLosesData: true,
  uniqueProperties: [{ path: 'Bucket', within: [] }],
})
export class S3Storage extends ATerraformResource<S3StorageSchema, S3Storage> {
  declare parents: MatchingResource<PrincipalResourceSchema>[];
  declare properties: S3StorageSchema['properties'];
  declare response: S3StorageSchema['response'];
  private readonly manifest: IManifest = {};

  private sourcePathDigests: S3StorageSchema['sourcePathDigests'] = {};

  /**
   * @internal
   */
  constructor(
    resourceId: string,
    properties: S3StorageSchema['properties'],
    parents: (MatchingResource<PrincipalResourceSchema> | AResource<BaseResourceSchema, any>)[] = [],
  ) {
    super(resourceId, properties, parents);

    this.updatePrincipalResourceDependencyBehaviors(
      parents.map((p) => (p instanceof MatchingResource ? p.getActual() : p)),
    );
  }

  /**
   * @internal
   */
  static override async unSynth<S extends BaseResourceSchema, T>(
    deserializationClass: any,
    resource: S,
    deReferenceResource: (context: string) => Promise<AResource<BaseResourceSchema, any>>,
  ): Promise<T> {
    const s3Storage = (await super.unSynth(deserializationClass, resource, deReferenceResource)) as S3Storage;
    const digests = (resource as unknown as S3StorageSchema).sourcePathDigests;
    s3Storage.sourcePathDigests = digests ? { ...digests } : {};
    return s3Storage as T;
  }

  /**
   * Admits one principal to an access prefix of this bucket, as statements of the bucket's policy.
   *
   * A principal already admitted to the prefix has its read and write replaced. A `cloudfront`
   * principal may only read.
   *
   * @internal
   */
  addPermission(
    principal: MatchingResource<PrincipalResourceSchema>,
    accessPrefix: string,
    options: { allowRead: boolean; allowWrite: boolean; principalType: IS3StoragePrincipalType },
  ): void {
    if (options.principalType === 'cloudfront' && options.allowWrite) {
      throw new ResourceError('A CloudFront distribution cannot write to a bucket!', this);
    }

    const principalResourceId = principal.getActual().resourceId;

    const existingPermission = this.properties.permissions.find(
      (p) => p.principalResourceId === principalResourceId && p.accessPrefix === accessPrefix,
    );
    if (existingPermission) {
      existingPermission.allowRead = options.allowRead;
      existingPermission.allowWrite = options.allowWrite;
      return;
    }

    if (!this.properties.permissions.some((p) => p.principalResourceId === principalResourceId)) {
      principal.addChild('resourceId', this, 'resourceId');
      this.updatePrincipalResourceDependencyBehaviors([principal.getActual()]);
    }

    this.properties.permissions.push({
      accessPrefix,
      allowRead: options.allowRead,
      allowWrite: options.allowWrite,
      principalResourceId,
      principalType: options.principalType,
    });
  }

  /**
   * @internal
   */
  override async diffProperties(previous: S3Storage): Promise<Diff[]> {
    if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties, ['blockPublicAccess', 'permissions'])) {
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

    // Propose a public access update when the block is turned on or off.
    if (previous.properties.blockPublicAccess !== this.properties.blockPublicAccess) {
      diffs.push(new Diff(this, DiffAction.UPDATE, 'blockPublicAccess', this.properties.blockPublicAccess));
    }

    // Propose a policy update when the permissions change.
    const sortPermissions = (
      permissions: S3StorageSchema['properties']['permissions'],
    ): S3StorageSchema['properties']['permissions'] =>
      [...permissions].sort((a, b) =>
        `${a.principalResourceId}/${a.accessPrefix}`.localeCompare(`${b.principalResourceId}/${b.accessPrefix}`),
      );
    if (
      !DiffUtility.isObjectDeepEquals(
        { permissions: sortPermissions(previous.properties.permissions) },
        { permissions: sortPermissions(this.properties.permissions) },
      )
    ) {
      diffs.push(
        new Diff(
          this,
          DiffAction.UPDATE,
          'update-permissions',
          JSON.parse(JSON.stringify(this.properties.permissions)),
        ),
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

      if (this.properties.permissions.length > 0) {
        diffs.push(
          new Diff(
            this,
            DiffAction.UPDATE,
            'update-permissions',
            JSON.parse(JSON.stringify(this.properties.permissions)),
          ),
        );
      }

      if (Object.keys(this.manifest).length > 0) {
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
  override synth(): S3StorageSchema {
    return {
      ...super.synth(),
      sourcePathDigests: JSON.parse(JSON.stringify(this.sourcePathDigests)),
    };
  }

  /**
   * @internal
   */
  override async toHCL(terraform: TerraformModuleScope): Promise<void> {
    const s3StorageOctoResource = terraform.addOctoTerraformResource(this as S3Storage, {
      provider: { accountId: this.properties.awsAccountId, regionId: this.properties.awsRegionId },
    });

    const s3StorageTFResource = s3StorageOctoResource.addTerraformResource('aws_s3_bucket', this.resourceId, {
      bucket: this.properties.Bucket,
    });
    s3StorageOctoResource.output({
      Arn: terraform.raw(`${s3StorageTFResource.address}.arn`),
      awsRegionId: this.properties.awsRegionId,
      Bucket: terraform.raw(`${s3StorageTFResource.address}.id`),
      RegionalDomainName: terraform.raw(`${s3StorageTFResource.address}.bucket_regional_domain_name`),
    });

    // Close the bucket to the public.
    if (this.properties.blockPublicAccess) {
      s3StorageOctoResource.addTerraformResource(
        'aws_s3_bucket_public_access_block',
        `${this.resourceId}-public-access`,
        {
          block_public_acls: true,
          block_public_policy: true,
          bucket: terraform.raw(`${s3StorageTFResource.address}.id`),
          ignore_public_acls: true,
          restrict_public_buckets: true,
        },
      );
    }

    // Admit each principal to its access prefix, one statement per principal and verb.
    const statements: object[] = [];
    for (const permission of this.properties.permissions) {
      const principalParent = this.parents.find((p) => p.getActual().resourceId === permission.principalResourceId)!;
      const principalArn = terraform.getRef(principalParent, 'Arn');
      const resources =
        permission.accessPrefix === ''
          ? [terraform.raw(`"\${${s3StorageTFResource.address}.arn}/*"`)]
          : [
              terraform.raw(`"\${${s3StorageTFResource.address}.arn}/${permission.accessPrefix}"`),
              terraform.raw(`"\${${s3StorageTFResource.address}.arn}/${permission.accessPrefix}/*"`),
            ];

      if (permission.principalType === 'cloudfront') {
        if (permission.allowRead) {
          statements.push({
            Action: ['s3:GetObject'],
            Condition: { StringEquals: { 'AWS:SourceArn': principalArn } },
            Effect: 'Allow',
            Principal: { Service: 'cloudfront.amazonaws.com' },
            Resource: resources,
            Sid: PolicyUtility.getSafeSid(`${permission.principalResourceId}-CloudFrontReadPermission`),
          });
        }
        continue;
      }

      if (permission.allowRead) {
        statements.push({
          Action: ['s3:GetObject'],
          Effect: 'Allow',
          Principal: { AWS: [principalArn] },
          Resource: resources,
          Sid: PolicyUtility.getSafeSid(`${permission.principalResourceId}-ReadPermission`),
        });
      }

      if (permission.allowWrite) {
        statements.push({
          Action: ['s3:PutObject'],
          Effect: 'Allow',
          Principal: { AWS: [principalArn] },
          Resource: resources,
          Sid: PolicyUtility.getSafeSid(`${permission.principalResourceId}-WritePermission`),
        });
      }
    }
    if (statements.length > 0) {
      s3StorageOctoResource.addTerraformResource('aws_s3_bucket_policy', `${this.resourceId}-policy`, {
        bucket: terraform.raw(`${s3StorageTFResource.address}.id`),
        policy: terraform.jsonencode({
          Statement: statements,
          Version: '2012-10-17',
        }),
      });
    }

    // Upload each file.
    for (const [remotePath, { digest, filePath }] of Object.entries(this.manifest)) {
      if (digest === 'deleted') {
        continue;
      }

      const safeLabel = PolicyUtility.getSafeSid(remotePath);
      const contentType = mime.getType(remotePath) ?? 'application/octet-stream';
      const sourceHcl = terraform.localPath(filePath);
      // Files upload in parallel: each waits only on the bucket it names.
      s3StorageOctoResource.addTerraformResource(
        'aws_s3_object',
        `${this.resourceId}_file_${safeLabel}`,
        {
          bucket: terraform.raw(`${s3StorageTFResource.address}.id`),
          content_type: contentType,
          etag: terraform.raw(`filemd5(${sourceHcl})`),
          key: remotePath,
          source: terraform.raw(sourceHcl),
        },
        { chain: false },
      );
    }

    if (Object.keys(this.tags).length > 0) {
      s3StorageTFResource.attribute('tags', this.tags);
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

  /**
   * @internal
   */
  private updatePrincipalResourceDependencyBehaviors(principals: AResource<BaseResourceSchema, any>[]): void {
    for (const principal of principals) {
      const s3StorageToPrincipalResourceDep = this.getDependency(principal, DependencyRelationship.CHILD)!;
      const principalResourceToS3StorageDep = principal.getDependency(this, DependencyRelationship.PARENT)!;

      // Before updating s3-storage must add principal-resource.
      s3StorageToPrincipalResourceDep.addBehavior(
        'update-permissions',
        DiffAction.UPDATE,
        'resourceId',
        DiffAction.ADD,
      );
      // Before deleting principal-resource must update s3-storage.
      principalResourceToS3StorageDep.addBehavior(
        'resourceId',
        DiffAction.DELETE,
        'update-permissions',
        DiffAction.UPDATE,
      );
    }
  }
}
