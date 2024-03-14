import { Action, ActionOutputs, Diff, DiffAction, Factory, ModelType } from '@quadnix/octo';
import { IamRole } from '../../../resources/iam/iam-role.resource.js';
import { AAction } from '../../action.abstract.js';
import { AwsServer } from '../aws.server.model.js';

@Action(ModelType.MODEL)
export class AddServerModelAction extends AAction {
  readonly ACTION_NAME: string = 'AddServerModelAction';

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'server' && diff.field === 'serverKey';
  }

  async handle(diff: Diff): Promise<ActionOutputs> {
    const server = diff.model as AwsServer;
    const serverIamRoleName = server.getAnchors()[0].anchorId;

    // Create IAM Role.
    const iamRole = new IamRole(`iam-role-${serverIamRoleName}`, { rolename: serverIamRoleName });

    const output: ActionOutputs = {};
    output[iamRole.resourceId] = iamRole;

    return output;
  }
}

@Factory<AddServerModelAction>(AddServerModelAction)
export class AddServerModelActionFactory {
  static async create(): Promise<AddServerModelAction> {
    return new AddServerModelAction();
  }
}
