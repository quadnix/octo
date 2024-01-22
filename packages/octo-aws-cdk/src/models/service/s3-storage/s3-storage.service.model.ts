import { Diff, DiffAction, Model, Service } from '@quadnix/octo';
import { basename } from 'path';
import { IamRoleAnchor } from '../../../anchors/iam-role.anchor.model.js';
import { AwsRegion, RegionId } from '../../region/aws.region.model.js';
import { IS3StorageService } from './s3-storage.service.interface.js';

@Model()
export class S3StorageService extends Service {
  readonly awsRegionId: string;

  readonly bucketName: string;

  readonly directories: {
    directoryReadAnchorName: string;
    directoryWriteAnchorName: string;
    remoteDirectoryPath: string;
  }[] = [];

  constructor(regionId: RegionId, bucketName: string) {
    super(`${bucketName}-s3-storage`);

    this.awsRegionId = AwsRegion.getRegionIdParts(regionId).awsRegionId;
    this.bucketName = bucketName;
  }

  addDirectory(remoteDirectoryPath: string): IamRoleAnchor[] {
    if (this.directories.find((d) => d.remoteDirectoryPath === remoteDirectoryPath)) {
      throw new Error('Remote directory already added in S3 bucket!');
    }

    const directoryName = basename(remoteDirectoryPath);
    const directoryReadAnchorName = `${directoryName}DirectoryReaderRole`;
    const directoryWriteAnchorName = `${directoryName}DirectoryWriterRole`;

    const directoryReadAnchor = new IamRoleAnchor(directoryReadAnchorName, this);
    this.anchors.push(directoryReadAnchor);
    const directoryWriteAnchor = new IamRoleAnchor(directoryWriteAnchorName, this);
    this.anchors.push(directoryWriteAnchor);
    this.directories.push({ directoryReadAnchorName, directoryWriteAnchorName, remoteDirectoryPath });

    return [directoryReadAnchor, directoryWriteAnchor];
  }

  override async diff(previous?: S3StorageService): Promise<Diff[]> {
    const diff: Diff[] = [];

    for (const directory of previous?.directories || []) {
      if (!this.directories.find((d) => d.remoteDirectoryPath === directory.remoteDirectoryPath)) {
        diff.push(new Diff(previous!, DiffAction.DELETE, 'directories', directory));
      }
    }

    for (const directory of this.directories) {
      if (!previous?.directories?.find((d) => d.remoteDirectoryPath === directory.remoteDirectoryPath)) {
        diff.push(new Diff(this, DiffAction.ADD, 'directories', directory));
      }
    }

    return diff;
  }

  override synth(): IS3StorageService {
    return {
      awsRegionId: this.awsRegionId,
      bucketName: this.bucketName,
      directories: [...this.directories],
      serviceId: `${this.bucketName}-s3-storage`,
    };
  }

  static override async unSynth(s3Storage: IS3StorageService): Promise<S3StorageService> {
    const awsRegionId = AwsRegion.getRandomRegionIdFromAwsRegionId(s3Storage.awsRegionId);
    const service = new S3StorageService(awsRegionId!, s3Storage.bucketName);
    service.directories.push(...s3Storage.directories);
    return service;
  }
}
