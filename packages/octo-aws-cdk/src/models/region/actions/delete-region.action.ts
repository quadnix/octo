import { Diff, DiffAction, IActionInputs, IActionOutputs } from '@quadnix/octo';
import { SharedEfs } from '../../../resources/efs/efs.shared-resource.js';
import { InternetGateway } from '../../../resources/internet-gateway/internet-gateway.resource.js';
import { NetworkAcl } from '../../../resources/network-acl/network-acl.resource.js';
import { RouteTable } from '../../../resources/route-table/route-table.resource.js';
import { SecurityGroup } from '../../../resources/security-groups/security-group.resource.js';
import { Subnet } from '../../../resources/subnet/subnet.resource.js';
import { Vpc } from '../../../resources/vpc/vpc.resource.js';
import { Action } from '../../action.abstract.js';
import { AwsRegion } from '../aws.region.model.js';

export class DeleteRegionAction extends Action {
  readonly ACTION_NAME: string = 'DeleteRegionAction';

  override collectInput(diff: Diff): string[] {
    const { regionId } = diff.model as AwsRegion;

    return [
      `resource.${regionId}-vpc`,
      `resource.${regionId}-igw`,
      `resource.${regionId}-private-subnet-1`,
      `resource.${regionId}-public-subnet-1`,
      `resource.${regionId}-private-rt-1`,
      `resource.${regionId}-public-rt-1`,
      `resource.${regionId}-private-nacl-1`,
      `resource.${regionId}-public-nacl-1`,
      `resource.${regionId}-access-sg`,
      `resource.${regionId}-internal-open-sg`,
      `resource.${regionId}-private-closed-sg`,
      `resource.${regionId}-web-sg`,
      'resource.shared-efs-filesystem',
    ];
  }

  override collectOutput(diff: Diff): string[] {
    const { regionId } = diff.model as AwsRegion;

    return [
      `${regionId}-vpc`,
      `${regionId}-igw`,
      `${regionId}-private-subnet-1`,
      `${regionId}-public-subnet-1`,
      `${regionId}-private-rt-1`,
      `${regionId}-public-rt-1`,
      `${regionId}-private-nacl-1`,
      `${regionId}-public-nacl-1`,
      `${regionId}-access-sg`,
      `${regionId}-internal-open-sg`,
      `${regionId}-private-closed-sg`,
      `${regionId}-web-sg`,
    ];
  }

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'region' && diff.field === 'regionId';
  }

  handle(diff: Diff, actionInputs: IActionInputs): IActionOutputs {
    const { regionId } = diff.model as AwsRegion;

    const internalOpenSG = actionInputs[`resource.${regionId}-internal-open-sg`] as SecurityGroup;
    const privateSubnet1 = actionInputs[`resource.${regionId}-private-subnet-1`] as Subnet;

    const sharedEfs = actionInputs['resource.shared-efs-filesystem'] as SharedEfs;
    sharedEfs.markUpdated('regions', `DELETE:${regionId}`);
    sharedEfs.removeRelationship(privateSubnet1);
    sharedEfs.removeRelationship(internalOpenSG);

    const accessSG = actionInputs[`resource.${regionId}-access-sg`] as SecurityGroup;
    accessSG.markDeleted();
    internalOpenSG.markDeleted();
    const privateClosedSG = actionInputs[`resource.${regionId}-private-closed-sg`] as SecurityGroup;
    privateClosedSG.markDeleted();
    const webSG = actionInputs[`resource.${regionId}-web-sg`] as SecurityGroup;
    webSG.markDeleted();

    const privateNAcl1 = actionInputs[`resource.${regionId}-private-nacl-1`] as NetworkAcl;
    privateNAcl1.markDeleted();
    const publicNAcl1 = actionInputs[`resource.${regionId}-public-nacl-1`] as NetworkAcl;
    publicNAcl1.markDeleted();

    const privateRT1 = actionInputs[`resource.${regionId}-private-rt-1`] as RouteTable;
    privateRT1.markDeleted();
    const publicRT1 = actionInputs[`resource.${regionId}-public-rt-1`] as RouteTable;
    publicRT1.markDeleted();

    privateSubnet1.markDeleted();
    const publicSubnet1 = actionInputs[`resource.${regionId}-public-subnet-1`] as Subnet;
    publicSubnet1.markDeleted();

    const internetGateway = actionInputs[`resource.${regionId}-igw`] as InternetGateway;
    internetGateway.markDeleted();

    const vpc = actionInputs[`resource.${regionId}-vpc`] as Vpc;
    vpc.markDeleted();

    const output: IActionOutputs = {};
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
    output[sharedEfs.resourceId] = sharedEfs;

    return output;
  }
}
