import { Diff, DiffAction, Model, Service } from '@quadnix/octo';
import { basename } from 'path';
import { IamRoleAnchor } from '../../../anchors/iam-role.anchor.model';
import { AwsRegion } from '../../region/aws.region.model';
import { IS3StorageService } from './s3-storage.service.interface';

export class S3StorageService extends Service {
  readonly bucketName: string;

  readonly directories: {
    directoryReadAnchorName: string;
    directoryWriteAnchorName: string;
    remoteDirectoryPath: string;
  }[] = [];

  readonly region: AwsRegion;

  constructor(region: AwsRegion, bucketName: string) {
    super(`${bucketName}-s3-storage`);

    this.region = region;
    this.bucketName = bucketName;

    this.addRelationship('serviceId', region, 'regionId');
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
      bucketName: this.bucketName,
      directories: [...this.directories],
      region: { context: this.region.getContext() },
      serviceId: `${this.bucketName}-s3-storage`,
    };
  }

  static async unSynth(
    s3Storage: IS3StorageService,
    deReferenceContext: (context: string) => Promise<Model<unknown, unknown>>,
  ): Promise<S3StorageService> {
    const region = (await deReferenceContext(s3Storage.region.context)) as AwsRegion;
    const service = new S3StorageService(region, s3Storage.bucketName);
    service.directories.push(...s3Storage.directories);
    return service;
  }
}
