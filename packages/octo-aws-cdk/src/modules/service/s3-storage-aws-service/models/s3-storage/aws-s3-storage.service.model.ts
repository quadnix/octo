import { Model, ModelError, Service, Validate } from '@quadnix/octo';
import { S3DirectoryAnchor } from '../../../../../anchors/s3-directory/s3-directory.anchor.js';
import { CommonUtility } from '../../../../../utilities/common/common.utility.js';
import { AwsS3StorageServiceSchema } from './aws-s3-storage.service.schema.js';

/**
 * @internal
 */
@Model<AwsS3StorageService>('@octo', 'service', AwsS3StorageServiceSchema)
export class AwsS3StorageService extends Service {
  @Validate({ options: { maxLength: 128, minLength: 2, regex: /^[a-zA-Z0-9][\w.-]*[a-zA-Z0-9]$/ } })
  readonly bucketName: string;

  readonly directories: { directoryAnchorName: string; remoteDirectoryPath: string }[] = [];

  constructor(bucketName: AwsS3StorageServiceSchema['bucketName']) {
    super(`${bucketName}-s3-storage`);

    this.bucketName = bucketName;
  }

  addDirectory(remoteDirectoryPath: string): void {
    if (this.directories.find((d) => d.remoteDirectoryPath === remoteDirectoryPath)) {
      throw new ModelError('Remote directory already added in S3 bucket!', this);
    }

    const directoryAnchorName = `S3DirectoryAnchor-${CommonUtility.hash(remoteDirectoryPath).substring(0, 12)}`;
    const directoryAnchor = new S3DirectoryAnchor(
      directoryAnchorName,
      {
        bucketName: this.bucketName,
        remoteDirectoryPath,
      },
      this,
    );
    this.addAnchor(directoryAnchor);

    this.directories.push({ directoryAnchorName, remoteDirectoryPath });
  }

  override synth(): AwsS3StorageServiceSchema {
    return {
      bucketName: this.bucketName,
      directories: JSON.parse(JSON.stringify(this.directories)),
      serviceId: this.serviceId,
    };
  }

  static override async unSynth(s3Storage: AwsS3StorageServiceSchema): Promise<AwsS3StorageService> {
    const service = new AwsS3StorageService(s3Storage.bucketName);
    service.directories.push(...(s3Storage.directories || []));
    return service;
  }
}
