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
import { IamRoleAnchor } from '../../../anchors/iam-role.anchor.js';
import { IamRole } from '../../../resources/iam/iam-role.resource.js';
import { AwsServer } from '../aws.server.model.js';

@Action(ModelType.MODEL)
export class DeleteServerModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'DeleteServerModelAction';

  collectInput(diff: Diff): string[] {
    const server = diff.model as AwsServer;
    const serverIamRole = server.getAnchor('ServerIamRoleAnchor') as IamRoleAnchor;
    const serverIamRoleName = serverIamRole.properties.iamRoleName;

    return [`resource.iam-role-${serverIamRoleName}`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.DELETE &&
      diff.model instanceof AwsServer &&
      diff.model.MODEL_NAME === 'server' &&
      diff.field === 'serverKey'
    );
  }

  async handle(diff: Diff, actionInputs: ActionInputs): Promise<ActionOutputs> {
    const server = diff.model as AwsServer;
    const serverIamRole = server.getAnchor('ServerIamRoleAnchor') as IamRoleAnchor;
    const serverIamRoleName = serverIamRole.properties.iamRoleName;

    const iamRole = actionInputs[`resource.iam-role-${serverIamRoleName}`] as IamRole;
    iamRole.remove();

    const output: ActionOutputs = {};
    output[iamRole.resourceId] = iamRole;

    return output;
  }

  async revert(): Promise<ActionOutputs> {
    return {};
  }
}

@Factory<DeleteServerModelAction>(DeleteServerModelAction)
export class DeleteServerModelActionFactory {
  static async create(): Promise<DeleteServerModelAction> {
    return new DeleteServerModelAction();
  }
}
