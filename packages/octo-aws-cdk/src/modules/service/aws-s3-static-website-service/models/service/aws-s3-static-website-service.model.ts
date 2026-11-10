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
import {
  type IManifest,
  type IS3FileExcludePath,
  type IS3FileSourcePath,
  S3FileSourceUtility,
} from '../../../../../utilities/s3-file-source/s3-file-source.utility.js';
import { AwsS3StaticWebsiteServiceSchema } from './aws-s3-static-website-service.schema.js';

/**
 * @internal
 */
@Model<AwsS3StaticWebsiteService>('@octo', 'service', AwsS3StaticWebsiteServiceSchema)
export class AwsS3StaticWebsiteService extends Service {
  @Validate({ options: { maxLength: 128, minLength: 2, regex: /^[a-zA-Z0-9][\w.-]*[a-zA-Z0-9]$/ } })
  readonly bucketName: string;

  readonly excludePaths: IS3FileExcludePath[] = [];

  readonly sourcePaths: IS3FileSourcePath[] = [];

  /**
   * @internal
   */
  constructor(bucketName: AwsS3StaticWebsiteServiceSchema['bucketName'], region: Region) {
    super(`${bucketName}-s3-static-website`, [region], ServiceType.STORAGE, 's3-static-website');

    this.bucketName = bucketName;
  }

  /**
   * @internal
   */
  static override async unSynth(
    service: AwsS3StaticWebsiteServiceSchema,
    deReferenceContext: (context: string) => Promise<AModel<any, any>>,
  ): Promise<AwsS3StaticWebsiteService> {
    const region = (await deReferenceContext(service.parents[0].context)) as Region;
    return new AwsS3StaticWebsiteService(service.bucketName, region);
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

    // Ensure index.html exists.
    if (this.sourcePaths.length > 0 && !(newManifestData['error.html'] || newManifestData['index.html'])) {
      throw new ModelError('error.html/index.html missing in root of website!', this);
    }

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
   * @internal
   */
  override synth(): AwsS3StaticWebsiteServiceSchema {
    return {
      ...super.synth(),
      bucketName: this.bucketName,
    };
  }
}
