import {
  Action,
  type ActionInputs,
  type ActionOutputs,
  Diff,
  DiffAction,
  Factory,
  type IModelAction,
  NodeType,
} from '@quadnix/octo';
import { AwsSubnet } from '../aws.subnet.model.js';

@Action(NodeType.MODEL)
export class UpdateSubnetAssociationModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'UpdateSubnetAssociationModelAction';

  collectInput(): string[] {
    return [];
  }

  filter(diff: Diff): boolean {
    if (diff.node instanceof AwsSubnet && diff.node.NODE_NAME === 'subnet') {
      if (diff.field === 'sibling') {
        return diff.action === DiffAction.ADD || diff.action === DiffAction.DELETE;
      } else {
        return false;
      }
    } else {
      return false;
    }
  }

  async handle(diff: Diff, actionInputs: ActionInputs, actionOutputs: ActionOutputs): Promise<ActionOutputs> {
    return actionOutputs;
  }
}

@Factory<UpdateSubnetAssociationModelAction>(UpdateSubnetAssociationModelAction)
export class UpdateSubnetAssociationModelActionFactory {
  static async create(): Promise<UpdateSubnetAssociationModelAction> {
    return new UpdateSubnetAssociationModelAction();
  }
}
