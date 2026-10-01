import {
  type AModel,
  Diff,
  DiffAction,
  Model,
  ModelError,
  type Region,
  Service,
  ServiceType,
  Validate,
} from '@quadnix/octo';
import { AwsS3StorageServiceAccessPrefixAnchor } from '../../../../../anchors/aws-s3-storage-service/aws-s3-storage-service-access-prefix.anchor.js';
import { CommonUtility } from '../../../../../utilities/common/common.utility.js';
import {
  type IManifest,
  type IS3FileExcludePath,
  type IS3FileSourcePath,
  S3FileSourceUtility,
} from '../../../../../utilities/s3-file-source/s3-file-source.utility.js';
import { AwsS3StorageServiceSchema } from './aws-s3-storage-service.schema.js';

/**
 * @internal
 */
@Model<AwsS3StorageService>('@octo', 'service', AwsS3StorageServiceSchema)
export class AwsS3StorageService extends Service {
  readonly accessPrefixes: { accessPrefix: string; accessPrefixAnchorName: string }[] = [];

  @Validate({ options: { maxLength: 128, minLength: 2, regex: /^[a-zA-Z0-9][\w.-]*[a-zA-Z0-9]$/ } })
  readonly bucketName: string;

  readonly excludePaths: IS3FileExcludePath[] = [];

  readonly sourcePaths: IS3FileSourcePath[] = [];

  /**
   * @internal
   */
  constructor(bucketName: AwsS3StorageServiceSchema['bucketName'], region: Region) {
    super(`${bucketName}-s3-storage`, [region], ServiceType.STORAGE, 's3');

    this.bucketName = bucketName;
  }

  /**
   * @internal
   */
  static override async unSynth(
    service: AwsS3StorageServiceSchema,
    deReferenceContext: (context: string) => Promise<AModel<any, any>>,
  ): Promise<AwsS3StorageService> {
    const region = (await deReferenceContext(service.parents[0].context)) as Region;
    const newService = new AwsS3StorageService(service.bucketName, region);
    newService.accessPrefixes.push(...(service.accessPrefixes || []));
    return newService;
  }

  /**
   * @internal
   */
  addAccessPrefix(accessPrefix: string): void {
    if (this.accessPrefixes.find((d) => d.accessPrefix === accessPrefix)) {
      throw new ModelError('Access prefix already added in S3 bucket!', this);
    }

    const accessPrefixHash = CommonUtility.hash(accessPrefix).substring(0, 12);
    const accessPrefixAnchorName = `AwsS3StorageServiceAccessPrefixAnchor-${accessPrefixHash}`;
    this.addAnchor(
      new AwsS3StorageServiceAccessPrefixAnchor(
        accessPrefixAnchorName,
        {
          accessPrefix,
          bucketName: this.bucketName,
        },
        this,
      ),
    );

    this.accessPrefixes.push({ accessPrefix, accessPrefixAnchorName });
  }

  /**
   * @internal
   */
  async addSource(
    directoryPath: string,
    subDirectoryOrFilePath?: string,
    filter?: (filePath: string) => boolean,
    transform?: (filePath: string) => string,
  ): Promise<void> {
    await S3FileSourceUtility.addSource(
      this.sourcePaths,
      this.excludePaths,
      directoryPath,
      subDirectoryOrFilePath,
      filter,
      transform,
    );
  }

  /**
   * @internal
   */
  override async diffProperties(): Promise<Diff[]> {
    // Generate new manifest.
    const newManifestData: IManifest = await S3FileSourceUtility.generateManifest(this.sourcePaths, this.excludePaths);

    if (Object.keys(newManifestData).length === 0) {
      return [];
    } else {
      const diff = new Diff<any, IManifest>(this, DiffAction.UPDATE, 'sourcePaths', newManifestData);
      this.addFieldDependency([
        { forAction: DiffAction.ADD, onAction: DiffAction.UPDATE, onField: 'sourcePaths', toField: 'serviceId' },
        { forAction: DiffAction.UPDATE, onAction: DiffAction.UPDATE, onField: 'sourcePaths', toField: 'serviceId' },
      ]);
      return [diff];
    }
  }

  /**
   * A digest of every file the bucket uploads, read from the local files. It changes whenever any
   * of them does, and does not depend on the order actions run in.
   *
   * @internal
   */
  async getContentDigest(): Promise<string> {
    return S3FileSourceUtility.digestManifest(
      await S3FileSourceUtility.generateManifest(this.sourcePaths, this.excludePaths),
    );
  }

  /**
   * @internal
   */
  override synth(): AwsS3StorageServiceSchema {
    return {
      ...super.synth(),
      accessPrefixes: JSON.parse(JSON.stringify(this.accessPrefixes)),
      bucketName: this.bucketName,
    };
  }
}
