import { Action, ActionInputs, ActionOutputs, Diff, DiffAction, Factory, ModelType } from '@quadnix/octo';
import { IamUser } from '../../../resources/iam/iam-user.resource.js';
import { AAction } from '../../action.abstract.js';
import { AwsServer } from '../aws.server.model.js';

@Action(ModelType.MODEL)
export class DeleteServerModelAction extends AAction {
  readonly ACTION_NAME: string = 'DeleteServerModelAction';

  override collectInput(diff: Diff): string[] {
    const server = diff.model as AwsServer;
    const serverIamUserName = server.getAnchors()[0].anchorId;

    return [`resource.iam-user-${serverIamUserName}`];
  }

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'server' && diff.field === 'serverKey';
  }

  async handle(diff: Diff, actionInputs: ActionInputs): Promise<ActionOutputs> {
    const server = diff.model as AwsServer;
    const serverIamUserName = server.getAnchors()[0].anchorId;

    const iamUser = actionInputs[`resource.iam-user-${serverIamUserName}`] as IamUser;
    iamUser.markDeleted();

    const output: ActionOutputs = {};
    output[iamUser.resourceId] = iamUser;

    return output;
  }
}

@Factory<DeleteServerModelAction>(DeleteServerModelAction)
export class DeleteServerModelActionFactory {
  static async create(): Promise<DeleteServerModelAction> {
    return new DeleteServerModelAction();
  }
}
