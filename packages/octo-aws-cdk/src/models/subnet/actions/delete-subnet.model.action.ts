import {
  Action,
  type ActionInputs,
  type ActionOutputs,
  Diff,
  DiffAction,
  Factory,
  type IModelAction,
  ModelType,
} from '@quadnix/octo';
import { NetworkAcl } from '../../../resources/network-acl/network-acl.resource.js';
import { RouteTable } from '../../../resources/route-table/route-table.resource.js';
import { Subnet } from '../../../resources/subnet/subnet.resource.js';
import { AwsSubnet } from '../aws.subnet.model.js';

@Action(ModelType.MODEL)
export class DeleteSubnetModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'DeleteSubnetModelAction';

  collectInput(diff: Diff): string[] {
    const subnet = diff.model as AwsSubnet;

    return [`resource.subnet-${subnet.subnetId}`, `resource.rt-${subnet.subnetId}`, `resource.nacl-${subnet.subnetId}`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.model instanceof AwsSubnet &&
      diff.model.MODEL_NAME === 'subnet' &&
      diff.field === 'subnetId'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs, actionOutputs: ActionOutputs): Promise<ActionOutputs> {
    const subnet = diff.model as AwsSubnet;

    const subnetNAcl = actionInputs[`resource.nacl-${subnet.subnetId}`] as NetworkAcl;
    subnetNAcl.remove();
    actionOutputs[subnetNAcl.resourceId] = subnetNAcl;

    const subnetRT = actionInputs[`resource.rt-${subnet.subnetId}`] as RouteTable;
    subnetRT.remove();
    actionOutputs[subnetRT.resourceId] = subnetRT;

    const subnetSubnet = actionInputs[`resource.subnet-${subnet.subnetId}`] as Subnet;
    subnetSubnet.remove();
    actionOutputs[subnetSubnet.resourceId] = subnetSubnet;

    return actionOutputs;
  }

  async revert(): Promise<ActionOutputs> {
    return {};
  }
}

@Factory<DeleteSubnetModelAction>(DeleteSubnetModelAction)
export class DeleteSubnetModelActionFactory {
  static async create(): Promise<DeleteSubnetModelAction> {
    return new DeleteSubnetModelAction();
  }
}
