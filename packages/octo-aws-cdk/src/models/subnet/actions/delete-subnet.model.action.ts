import {
  Action,
  ActionInputs,
  ActionOutputs,
  Diff,
  DiffAction,
  Factory,
  IModelAction,
  ModelType,
  Subnet as SubnetModel,
} from '@quadnix/octo';
import { NetworkAcl } from '../../../resources/network-acl/network-acl.resource.js';
import { RouteTable } from '../../../resources/route-table/route-table.resource.js';
import { Subnet } from '../../../resources/subnet/subnet.resource.js';

@Action(ModelType.MODEL)
export class DeleteSubnetModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'DeleteSubnetModelAction';

  collectInput(diff: Diff): string[] {
    const subnet = diff.model as SubnetModel;

    return [`resource.subnet-${subnet.subnetId}`, `resource.rt-${subnet.subnetId}`, `resource.nacl-${subnet.subnetId}`];
  }

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'subnet' && diff.field === 'subnetId';
  }

  async handle(diff: Diff, actionInputs: ActionInputs): Promise<ActionOutputs> {
    const subnet = diff.model as SubnetModel;

    const subnetNAcl = actionInputs[`resource.nacl-${subnet.subnetId}`] as NetworkAcl;
    subnetNAcl.markDeleted();

    const subnetRT = actionInputs[`resource.rt-${subnet.subnetId}`] as RouteTable;
    subnetRT.markDeleted();

    const subnetSubnet = actionInputs[`resource.subnet-${subnet.subnetId}`] as Subnet;
    subnetSubnet.markDeleted();

    const output: ActionOutputs = {};
    output[subnetSubnet.resourceId] = subnetSubnet;
    output[subnetRT.resourceId] = subnetRT;
    output[subnetNAcl.resourceId] = subnetNAcl;

    return output;
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
