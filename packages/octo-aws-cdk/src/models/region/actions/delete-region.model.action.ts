import { Action, ActionInputs, ActionOutputs, Diff, DiffAction, Factory, IModelAction, ModelType } from '@quadnix/octo';
import { Efs } from '../../../resources/efs/efs.resource.js';
import { SharedEfs } from '../../../resources/efs/efs.shared-resource.js';
import { InternetGateway } from '../../../resources/internet-gateway/internet-gateway.resource.js';
import { NetworkAcl } from '../../../resources/network-acl/network-acl.resource.js';
import { RouteTable } from '../../../resources/route-table/route-table.resource.js';
import { SecurityGroup } from '../../../resources/security-group/security-group.resource.js';
import { Subnet } from '../../../resources/subnet/subnet.resource.js';
import { Vpc } from '../../../resources/vpc/vpc.resource.js';
import { AwsRegion } from '../aws.region.model.js';

@Action(ModelType.MODEL)
export class DeleteRegionModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'DeleteRegionModelAction';

  collectInput(diff: Diff): string[] {
    const { regionId } = diff.model as AwsRegion;

    return [
      `resource.vpc-${regionId}`,
      `resource.igw-${regionId}`,
      `resource.subnet-${regionId}-private-1`,
      `resource.subnet-${regionId}-public-1`,
      `resource.rt-${regionId}-private-1`,
      `resource.rt-${regionId}-public-1`,
      `resource.nacl-${regionId}-private-1`,
      `resource.nacl-${regionId}-public-1`,
      `resource.sec-grp-${regionId}-access`,
      `resource.sec-grp-${regionId}-internal-open`,
      `resource.sec-grp-${regionId}-private-closed`,
      `resource.sec-grp-${regionId}-web`,
      `resource.efs-${regionId}-filesystem`,
      'resource.shared-efs-filesystem',
    ];
  }

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'region' && diff.field === 'regionId';
  }

  async handle(diff: Diff, actionInputs: ActionInputs): Promise<ActionOutputs> {
    const { regionId } = diff.model as AwsRegion;

    const internalOpenSG = actionInputs[`resource.sec-grp-${regionId}-internal-open`] as SecurityGroup;
    const privateSubnet1 = actionInputs[`resource.subnet-${regionId}-private-1`] as Subnet;

    const efs = actionInputs[`resource.efs-${regionId}-filesystem`] as Efs;
    const sharedEfs = actionInputs['resource.shared-efs-filesystem'] as SharedEfs;
    efs.removeRelationship(privateSubnet1);
    efs.removeRelationship(internalOpenSG);
    efs.removeRelationship(sharedEfs);
    efs.markDeleted();

    const accessSG = actionInputs[`resource.sec-grp-${regionId}-access`] as SecurityGroup;
    accessSG.markDeleted();
    internalOpenSG.markDeleted();
    const privateClosedSG = actionInputs[`resource.sec-grp-${regionId}-private-closed`] as SecurityGroup;
    privateClosedSG.markDeleted();
    const webSG = actionInputs[`resource.sec-grp-${regionId}-web`] as SecurityGroup;
    webSG.markDeleted();

    const privateNAcl1 = actionInputs[`resource.nacl-${regionId}-private-1`] as NetworkAcl;
    privateNAcl1.markDeleted();
    const publicNAcl1 = actionInputs[`resource.nacl-${regionId}-public-1`] as NetworkAcl;
    publicNAcl1.markDeleted();

    const privateRT1 = actionInputs[`resource.rt-${regionId}-private-1`] as RouteTable;
    privateRT1.markDeleted();
    const publicRT1 = actionInputs[`resource.rt-${regionId}-public-1`] as RouteTable;
    publicRT1.markDeleted();

    privateSubnet1.markDeleted();
    const publicSubnet1 = actionInputs[`resource.subnet-${regionId}-public-1`] as Subnet;
    publicSubnet1.markDeleted();

    const internetGateway = actionInputs[`resource.igw-${regionId}`] as InternetGateway;
    internetGateway.markDeleted();

    const vpc = actionInputs[`resource.vpc-${regionId}`] as Vpc;
    vpc.markDeleted();

    const output: ActionOutputs = {};
    output[vpc.resourceId] = vpc;
    output[internetGateway.resourceId] = internetGateway;
    output[privateSubnet1.resourceId] = privateSubnet1;
    output[publicSubnet1.resourceId] = publicSubnet1;
    output[privateRT1.resourceId] = privateRT1;
    output[publicRT1.resourceId] = publicRT1;
    output[privateNAcl1.resourceId] = privateNAcl1;
    output[publicNAcl1.resourceId] = publicNAcl1;
    output[accessSG.resourceId] = accessSG;
    output[internalOpenSG.resourceId] = internalOpenSG;
    output[privateClosedSG.resourceId] = privateClosedSG;
    output[webSG.resourceId] = webSG;
    output[efs.resourceId] = efs;

    return output;
  }

  async revert(): Promise<ActionOutputs> {
    return {};
  }
}

@Factory<DeleteRegionModelAction>(DeleteRegionModelAction)
export class DeleteRegionModelActionFactory {
  static async create(): Promise<DeleteRegionModelAction> {
    return new DeleteRegionModelAction();
  }
}
