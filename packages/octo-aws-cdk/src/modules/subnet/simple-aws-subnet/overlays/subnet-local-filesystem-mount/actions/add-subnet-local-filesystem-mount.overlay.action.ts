import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
  MatchingResource,
  hasNodeName,
} from '@quadnix/octo';
import { EfsSchema } from '../../../../../../resources/efs/index.schema.js';
import { EfsMountTarget } from '../../../../../../resources/efs-mount-target/index.js';
import { SecurityGroup } from '../../../../../../resources/security-group/index.js';
import type { Subnet } from '../../../../../../resources/subnet/index.js';
import { VpcSchema } from '../../../../../../resources/vpc/index.schema.js';
import type { AwsSubnetModule } from '../../../aws-subnet.module.js';
import { AwsSubnetLocalFilesystemMountOverlay } from '../aws-subnet-local-filesystem-mount.overlay.js';

/**
 * @internal
 */
@Action(AwsSubnetLocalFilesystemMountOverlay)
export class AddSubnetLocalFilesystemMountOverlayAction implements IModelAction<AwsSubnetModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsSubnetLocalFilesystemMountOverlay &&
      hasNodeName(diff.node, 'subnet-local-filesystem-mount-overlay') &&
      diff.field === 'overlayId'
    );
  }

  async handle(
    diff: Diff<AwsSubnetLocalFilesystemMountOverlay>,
    actionInputs: EnhancedModuleSchema<AwsSubnetModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const subnetLocalFilesystemMountOverlay = diff.node;
    const properties = subnetLocalFilesystemMountOverlay.properties;

    const { awsAccountId, awsRegionId } = actionInputs.metadata;

    const [matchingEfsResource] = await subnetLocalFilesystemMountOverlay.getResourcesMatchingSchema(EfsSchema, [
      { key: 'filesystemName', value: properties.filesystemName },
    ]);
    if (!matchingEfsResource) {
      throw new Error(`EFS "${properties.filesystemName}" not found!`);
    }
    const subnet = actionInputs.resources[`subnet-${properties.subnetId}`] as Subnet;
    const [matchingVpcResource] = (await subnetLocalFilesystemMountOverlay.getResourcesMatchingSchema(VpcSchema, [
      { key: 'awsAccountId', value: awsAccountId },
      { key: 'awsRegionId', value: awsRegionId },
    ]))!;

    // Create EFS Mount Target Security Groups.
    const efsMountTargetSG = new SecurityGroup(
      `sec-grp-efs-mount-${properties.regionId}-${properties.subnetName}-${properties.filesystemName}`,
      {
        awsAccountId,
        awsRegionId,
        rules: [
          {
            CidrBlock: actionInputs.inputs.subnetCidrBlock,
            Egress: false,
            FromPort: 2049,
            IpProtocol: 'tcp',
            ToPort: 2049,
          },
        ],
      },
      [matchingVpcResource],
    );

    // Create EFS Mount Target.
    const efsMountTarget = new EfsMountTarget(
      `efs-mount-${properties.regionId}-${properties.subnetName}-${properties.filesystemName}`,
      { awsAccountId, awsRegionId },
      [matchingEfsResource, new MatchingResource(subnet), new MatchingResource(efsMountTargetSG)],
    );

    actionOutputs[efsMountTargetSG.resourceId] = efsMountTargetSG;
    actionOutputs[efsMountTarget.resourceId] = efsMountTarget;
    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddSubnetLocalFilesystemMountOverlayAction>(AddSubnetLocalFilesystemMountOverlayAction)
export class AddSubnetLocalFilesystemMountOverlayActionFactory {
  private static instance: AddSubnetLocalFilesystemMountOverlayAction;

  static async create(): Promise<AddSubnetLocalFilesystemMountOverlayAction> {
    if (!this.instance) {
      this.instance = new AddSubnetLocalFilesystemMountOverlayAction();
    }
    return this.instance;
  }
}
