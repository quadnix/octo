import { Container, Model, ModelError, OverlayService, Service, Validate } from '@quadnix/octo';
import { IamRoleAnchor } from '../../../anchors/iam-role.anchor.js';
import { S3DirectoryAnchor } from '../../../anchors/s3-directory.anchor.js';
import { CommonUtility } from '../../../utilities/common/common.utility.js';
import { AwsRegion, RegionId } from '../../region/aws.region.model.js';
import type { AwsServer } from '../../server/aws.server.model.js';
import { S3StorageAccessOverlay } from '../../../overlays/s3-storage-access/s3-storage-access.overlay.js';
import type { IS3StorageService } from './s3-storage.service.interface.js';

export enum S3StorageAccess {
  READ = 'READ',
  READ_WRITE = 'READ_WRITE',
  WRITE = 'WRITE',
}

@Model()
export class S3StorageService extends Service {
  readonly awsRegionId: string;

  @Validate({ options: { maxLength: 128, minLength: 2, regex: /^[a-zA-Z0-9][\w.-]*[a-zA-Z0-9]$/ } })
  readonly bucketName: string;

  readonly directories: { directoryAnchorName: string; remoteDirectoryPath: string }[] = [];

  constructor(regionId: RegionId, bucketName: string) {
    super(`${bucketName}-s3-storage`);

    this.awsRegionId = AwsRegion.getRegionIdParts(regionId).awsRegionId;
    this.bucketName = bucketName;
  }

  addDirectory(remoteDirectoryPath: string): void {
    if (this.directories.find((d) => d.remoteDirectoryPath === remoteDirectoryPath)) {
      throw new ModelError('Remote directory already added in S3 bucket!', this);
    }

    const directoryAnchorName = `${CommonUtility.hash(remoteDirectoryPath).substring(0, 12)}S3DirectoryAnchor`;
    const directoryAnchor = new S3DirectoryAnchor(directoryAnchorName, {}, this);
    this.addAnchor(directoryAnchor);

    this.directories.push({ directoryAnchorName, remoteDirectoryPath });
  }

  async allowDirectoryAccess(
    server: AwsServer,
    remoteDirectoryPath: string,
    accessLevel: S3StorageAccess,
  ): Promise<void> {
    const directory = this.directories.find((d) => d.remoteDirectoryPath === remoteDirectoryPath);
    if (!directory) {
      throw new ModelError('Cannot find remote directory!', this);
    }

    const allowRead = accessLevel === S3StorageAccess.READ || accessLevel === S3StorageAccess.READ_WRITE;
    const allowWrite = accessLevel === S3StorageAccess.WRITE || accessLevel === S3StorageAccess.READ_WRITE;
    if (!allowRead && !allowWrite) {
      return;
    }

    const directoryAnchor = this.getAnchor(directory.directoryAnchorName) as S3DirectoryAnchor;
    const serverRoleAnchor = server.getAnchor('ServerIamRoleAnchor') as IamRoleAnchor;

    const overlayService = await Container.get(OverlayService);

    const overlayIdSuffix = CommonUtility.hash(serverRoleAnchor.anchorId, directory.remoteDirectoryPath, accessLevel);
    const overlayId = `s3-storage-access-overlay-${overlayIdSuffix}`;
    const s3StorageAccessOverlay = new S3StorageAccessOverlay(
      overlayId,
      {
        allowRead,
        allowWrite,
        bucketName: this.bucketName,
        remoteDirectoryPath: directory.remoteDirectoryPath,
      },
      [serverRoleAnchor, directoryAnchor],
    );
    overlayService.addOverlay(s3StorageAccessOverlay);
  }

  override synth(): IS3StorageService {
    return {
      awsRegionId: this.awsRegionId,
      bucketName: this.bucketName,
      directories: JSON.parse(JSON.stringify(this.directories)),
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
