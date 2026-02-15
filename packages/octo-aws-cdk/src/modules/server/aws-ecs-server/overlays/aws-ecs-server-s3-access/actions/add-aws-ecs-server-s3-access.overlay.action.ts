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
  OverlayActionExceptionTransactionError,
  hasNodeName,
} from '@quadnix/octo';
import type { IamRole } from '../../../../../../resources/iam-role/index.js';
import type { S3Storage } from '../../../../../../resources/s3-storage/index.js';
import { S3StorageSchema } from '../../../../../../resources/s3-storage/index.schema.js';
import type { AwsEcsServerModule } from '../../../aws-ecs-server.module.js';
import { AwsEcsServerS3AccessOverlay } from '../aws-ecs-server-s3-access.overlay.js';

/**
 * @internal
 */
@Action(AwsEcsServerS3AccessOverlay)
export class AddAwsEcsServerS3AccessOverlayAction implements IModelAction<AwsEcsServerModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsEcsServerS3AccessOverlay &&
      hasNodeName(diff.node, 'aws-ecs-server-s3-access-overlay') &&
      diff.field === 'overlayId'
    );
  }

  async handle(
    diff: Diff<AwsEcsServerS3AccessOverlay>,
    actionInputs: EnhancedModuleSchema<AwsEcsServerModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const serverS3AccessOverlay = diff.node;
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
      throw new OverlayActionExceptionTransactionError(
        `Bucket "${properties.bucketName}" not found!`,
        diff,
        this.constructor.name,
      );
    }

    (matchingS3StorageResource.getActual() as S3Storage).addPermission(
      new MatchingResource(iamRole),
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

/**
 * @internal
 */
@Factory<AddAwsEcsServerS3AccessOverlayAction>(AddAwsEcsServerS3AccessOverlayAction)
export class AddAwsEcsServerS3AccessOverlayActionFactory {
  private static instance: AddAwsEcsServerS3AccessOverlayAction;

  static async create(): Promise<AddAwsEcsServerS3AccessOverlayAction> {
    if (!this.instance) {
      this.instance = new AddAwsEcsServerS3AccessOverlayAction();
    }
    return this.instance;
  }
}
