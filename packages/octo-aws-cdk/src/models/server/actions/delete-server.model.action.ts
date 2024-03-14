import { Action, ActionInputs, ActionOutputs, Diff, DiffAction, Factory, ModelType } from '@quadnix/octo';
import { IamRole } from '../../../resources/iam/iam-role.resource.js';
import { AAction } from '../../action.abstract.js';
import { AwsServer } from '../aws.server.model.js';

@Action(ModelType.MODEL)
export class DeleteServerModelAction extends AAction {
  readonly ACTION_NAME: string = 'DeleteServerModelAction';

  override collectInput(diff: Diff): string[] {
    const server = diff.model as AwsServer;
    const serverIamRoleName = server.getAnchors()[0].anchorId;

    return [`resource.iam-role-${serverIamRoleName}`];
  }

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'server' && diff.field === 'serverKey';
  }

  async handle(diff: Diff, actionInputs: ActionInputs): Promise<ActionOutputs> {
    const server = diff.model as AwsServer;
    const serverIamRoleName = server.getAnchors()[0].anchorId;

    const iamRole = actionInputs[`resource.iam-role-${serverIamRoleName}`] as IamRole;
    iamRole.markDeleted();

    const output: ActionOutputs = {};
    output[iamRole.resourceId] = iamRole;

    return output;
  }
}

@Factory<DeleteServerModelAction>(DeleteServerModelAction)
export class DeleteServerModelActionFactory {
  static async create(): Promise<DeleteServerModelAction> {
    return new DeleteServerModelAction();
  }
}
