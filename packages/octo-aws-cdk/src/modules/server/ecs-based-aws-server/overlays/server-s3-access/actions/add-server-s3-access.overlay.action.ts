import {
  type AModel,
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
} from '@quadnix/octo';
import type { IamRole } from '../../../../../../resources/iam-role/index.js';
import type { S3Storage } from '../../../../../../resources/s3-storage/index.js';
import {
  AwsS3DirectoryAnchorSchema,
  type AwsS3StorageServiceSchema,
  type AwsServerModule,
  S3StorageResourceSchema,
} from '../../../aws-server.module.js';
import { AwsServerS3AccessOverlay } from '../aws-server-s3-access.overlay.js';

@Action(AwsServerS3AccessOverlay)
export class AddAwsServerS3AccessOverlayAction implements IModelAction<AwsServerModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsServerS3AccessOverlay &&
      (diff.node.constructor as typeof AwsServerS3AccessOverlay).NODE_NAME === 'server-s3-access-overlay' &&
      diff.field === 'overlayId'
    );
  }

  async handle(
    diff: Diff,
    actionInputs: EnhancedModuleSchema<AwsServerModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const serverS3AccessOverlay = diff.node as AwsServerS3AccessOverlay;
    const properties = serverS3AccessOverlay.properties;

    const iamRole = actionInputs.resources[`iam-role-${properties.iamRoleName}`] as IamRole;
    iamRole.addS3BucketPolicy(properties.iamRolePolicyId, properties.bucketName, properties.remoteDirectoryPath, {
      allowRead: properties.allowRead,
      allowWrite: properties.allowWrite,
    });

    const [[, awsS3DirectoryAnchor]] = await serverS3AccessOverlay.getAnchorsMatchingSchema(
      AwsS3DirectoryAnchorSchema,
      [{ key: 'remoteDirectoryPath', value: properties.remoteDirectoryPath }],
    );
    const s3StorageService = awsS3DirectoryAnchor.getParent() as AModel<AwsS3StorageServiceSchema, any>;
    const [[, s3Storage]] = await s3StorageService.getResourcesMatchingSchema(S3StorageResourceSchema, [], [], {
      searchBoundaryMembers: false,
    });
    (s3Storage as S3Storage).addPermission(iamRole, properties.remoteDirectoryPath, {
      allowRead: properties.allowRead,
      allowWrite: properties.allowWrite,
    });

    actionOutputs[iamRole.resourceId] = iamRole;
    actionOutputs[s3Storage.resourceId] = s3Storage;
    return actionOutputs;
  }
}

@Factory<AddAwsServerS3AccessOverlayAction>(AddAwsServerS3AccessOverlayAction)
export class AddAwsServerS3AccessOverlayActionFactory {
  private static instance: AddAwsServerS3AccessOverlayAction;

  static async create(): Promise<AddAwsServerS3AccessOverlayAction> {
    if (!this.instance) {
      this.instance = new AddAwsServerS3AccessOverlayAction();
    }
    return this.instance;
  }
}
