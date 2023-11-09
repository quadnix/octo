import { Action, ActionOutputs, Diff, DiffAction, Factory, ModelType } from '@quadnix/octo';
import { IamUser } from '../../../resources/iam/iam-user.resource.js';
import { AAction } from '../../action.abstract.js';
import { AwsServer } from '../aws.server.model.js';

@Action(ModelType.MODEL)
export class AddServerAction extends AAction {
  readonly ACTION_NAME: string = 'AddServerAction';

  override collectOutput(diff: Diff): string[] {
    const server = diff.model as AwsServer;
    const serverIamUserName = server.getAnchors([])[0].ANCHOR_NAME;

    return [`iam-user-${serverIamUserName}`];
  }

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'server' && diff.field === 'serverKey';
  }

  handle(diff: Diff): ActionOutputs {
    const server = diff.model as AwsServer;
    const serverIamUserName = server.getAnchors()[0].ANCHOR_NAME;

    // Create IAM User.
    const iamUser = new IamUser(`iam-user-${serverIamUserName}`, {
      username: serverIamUserName,
    });

    const output: ActionOutputs = {};
    output[iamUser.resourceId] = iamUser;

    return output;
  }
}

@Factory<AddServerAction>(AddServerAction)
export class AddServerActionFactory {
  static async create(): Promise<AddServerAction> {
    return new AddServerAction();
  }
}
