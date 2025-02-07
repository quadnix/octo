import {
  type AModel,
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
  MatchingResource,
} from '@quadnix/octo';
import type { IamRole } from '../../../../../../resources/iam-role/index.js';
import type { S3Storage } from '../../../../../../resources/s3-storage/index.js';
import { S3StorageSchema } from '../../../../../../resources/s3-storage/s3-storage.schema.js';
import type { AwsServerModule } from '../../../aws-server.module.js';
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

    const s3DirectoryAnchor = serverS3AccessOverlay.anchors[1];
    const s3StorageService = s3DirectoryAnchor.getActual().getParent() as AModel<any, any>;
    const [matchingS3StorageResource] = await s3StorageService.getResourcesMatchingSchema(S3StorageSchema, [], [], {
      searchBoundaryMembers: false,
    });
    if (!matchingS3StorageResource) {
      throw new Error(`Bucket "${properties.bucketName}" not found!`);
    }

    (matchingS3StorageResource.getActual() as S3Storage).addPermission(
      new MatchingResource(iamRole, iamRole.synth()),
      properties.remoteDirectoryPath,
      {
        allowRead: properties.allowRead,
        allowWrite: properties.allowWrite,
      },
    );

    actionOutputs[iamRole.resourceId] = iamRole;
    actionOutputs[matchingS3StorageResource.getActual().resourceId] = matchingS3StorageResource.getActual();
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
