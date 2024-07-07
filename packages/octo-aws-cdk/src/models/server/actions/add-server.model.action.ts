import {
  Action,
  ActionInputs,
  type ActionOutputs,
  Diff,
  DiffAction,
  Factory,
  type IModelAction,
  ModelType,
} from '@quadnix/octo';
import { IamRoleAnchor } from '../../../anchors/iam-role.anchor.js';
import { IamRole } from '../../../resources/iam/iam-role.resource.js';
import { AwsServer } from '../aws.server.model.js';

@Action(ModelType.MODEL)
export class AddServerModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'AddServerModelAction';

  collectInput(): string[] {
    return [];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.model instanceof AwsServer &&
      diff.model.MODEL_NAME === 'server' &&
      diff.field === 'serverKey'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs, actionOutputs: ActionOutputs): Promise<ActionOutputs> {
    const server = diff.model as AwsServer;
    const serverIamRole = server.getAnchor('ServerIamRoleAnchor') as IamRoleAnchor;
    const serverIamRoleName = serverIamRole.properties.iamRoleName;

    // Create IAM Role.
    const iamRole = new IamRole(`iam-role-${serverIamRoleName}`, { rolename: `iam-role-${serverIamRoleName}` });
    actionOutputs[iamRole.resourceId] = iamRole;

    return actionOutputs;
  }

  async revert(): Promise<ActionOutputs> {
    return {};
  }
}

@Factory<AddServerModelAction>(AddServerModelAction)
export class AddServerModelActionFactory {
  static async create(): Promise<AddServerModelAction> {
    return new AddServerModelAction();
  }
}
