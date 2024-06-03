import { Container, Model, OverlayService, Service } from '@quadnix/octo';
import { IamRoleAnchor } from '../../../anchors/iam-role.anchor.js';
import { S3DirectoryAnchor } from '../../../anchors/s3-directory.anchor.js';
import { CommonUtility } from '../../../utilities/common/common.utility.js';
import { AwsRegion } from '../../region/aws.region.model.js';
import type { RegionId } from '../../region/aws.region.model.js';
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

  readonly bucketName: string;

  readonly directories: { directoryAnchorName: string; remoteDirectoryPath: string }[] = [];

  constructor(regionId: RegionId, bucketName: string) {
    super(`${bucketName}-s3-storage`);

    this.awsRegionId = AwsRegion.getRegionIdParts(regionId).awsRegionId;
    this.bucketName = bucketName;
  }

  addDirectory(remoteDirectoryPath: string): void {
    if (this.directories.find((d) => d.remoteDirectoryPath === remoteDirectoryPath)) {
      throw new Error('Remote directory already added in S3 bucket!');
    }

    const directoryAnchorName = `${CommonUtility.hash(remoteDirectoryPath).substring(0, 12)}Directory`;
    const directoryAnchor = new S3DirectoryAnchor(directoryAnchorName, this);
    this.anchors.push(directoryAnchor);

    this.directories.push({ directoryAnchorName, remoteDirectoryPath });
  }

  async allowDirectoryAccess(
    server: AwsServer,
    remoteDirectoryPath: string,
    accessLevel: S3StorageAccess,
  ): Promise<void> {
    const directory = this.directories.find((d) => d.remoteDirectoryPath === remoteDirectoryPath);
    if (!directory) {
      throw new Error('Cannot find remote directory!');
    }

    const allowRead = accessLevel === S3StorageAccess.READ || accessLevel === S3StorageAccess.READ_WRITE;
    const allowWrite = accessLevel === S3StorageAccess.WRITE || accessLevel === S3StorageAccess.READ_WRITE;
    if (!allowRead && !allowWrite) {
      return;
    }

    const directoryAnchor = this.anchors.find((a) => a.anchorId === directory.directoryAnchorName)!;
    const serverAnchor = server.getAnchors().find((a) => a instanceof IamRoleAnchor)!;
    const overlayId = CommonUtility.hash(serverAnchor.anchorId, directory.remoteDirectoryPath, accessLevel);

    const overlayService = await Container.get(OverlayService);
    const s3StorageAccessOverlay = new S3StorageAccessOverlay(
      overlayId,
      {
        allowRead,
        allowWrite,
        bucketName: this.bucketName,
        remoteDirectoryPath: directory.remoteDirectoryPath,
      },
      [serverAnchor, directoryAnchor],
    );
    overlayService.addOverlay(s3StorageAccessOverlay);
  }

  async revokeDirectoryAccess(
    server: AwsServer,
    remoteDirectoryPath: string,
    accessLevel: S3StorageAccess,
  ): Promise<void> {
    const directory = this.directories.find((d) => d.remoteDirectoryPath === remoteDirectoryPath);
    if (!directory) {
      throw new Error('Cannot find remote directory!');
    }

    const serverAnchor = server.getAnchors().find((a) => a instanceof IamRoleAnchor)!;
    const overlayId = CommonUtility.hash(serverAnchor.anchorId, directory.remoteDirectoryPath, accessLevel);

    const overlayService = await Container.get(OverlayService);
    const overlay = overlayService.getOverlayById(overlayId);
    overlayService.removeOverlay(overlay!);
  }

  async removeDirectory(remoteDirectoryPath: string): Promise<void> {
    const directoryIndex = this.directories.findIndex((d) => d.remoteDirectoryPath === remoteDirectoryPath);
    if (directoryIndex === -1) {
      throw new Error('Cannot find remote directory!');
    }

    const overlayService = await Container.get(OverlayService);
    const directory = this.directories[directoryIndex];
    const overlays = overlayService.getOverlayByProperties([
      { key: 'bucketName', value: this.bucketName },
      { key: 'remoteDirectoryPath', value: directory.remoteDirectoryPath },
    ]);
    if (overlays.length > 0) {
      throw new Error('Cannot remove directory while overlay exists!');
    }

    this.directories.splice(directoryIndex, 1);
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
