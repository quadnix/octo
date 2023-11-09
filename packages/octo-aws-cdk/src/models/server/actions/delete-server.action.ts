import { Action, ActionInputs, ActionOutputs, Diff, DiffAction, Factory, ModelType } from '@quadnix/octo';
import { IamUser } from '../../../resources/iam/iam-user.resource.js';
import { AAction } from '../../action.abstract.js';
import { AwsServer } from '../aws.server.model.js';

@Action(ModelType.MODEL)
export class DeleteServerAction extends AAction {
  readonly ACTION_NAME: string = 'DeleteServerAction';

  override collectInput(diff: Diff): string[] {
    const server = diff.model as AwsServer;
    const serverIamUserName = server.getAnchors([])[0].ANCHOR_NAME;

    return [`resource.iam-user-${serverIamUserName}`];
  }

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'server' && diff.field === 'serverKey';
  }

  handle(diff: Diff, actionInputs: ActionInputs): ActionOutputs {
    const server = diff.model as AwsServer;
    const serverIamUserName = server.getAnchors()[0].ANCHOR_NAME;

    const iamUser = actionInputs[`resource.iam-user-${serverIamUserName}`] as IamUser;
    iamUser.markDeleted();

    const output: ActionOutputs = {};
    output[iamUser.resourceId] = iamUser;

    return output;
  }
}

@Factory<DeleteServerAction>(DeleteServerAction)
export class DeleteServerActionFactory {
  static async create(): Promise<DeleteServerAction> {
    return new DeleteServerAction();
  }
}
