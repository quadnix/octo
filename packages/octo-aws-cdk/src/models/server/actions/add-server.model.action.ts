import { Action, ActionOutputs, Diff, DiffAction, Factory, ModelType } from '@quadnix/octo';
import { IamUser } from '../../../resources/iam/iam-user.resource.js';
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
    const serverIamUserName = server.getAnchors()[0].anchorId;

    // Create IAM User.
    const iamUser = new IamUser(`iam-user-${serverIamUserName}`, {
      username: serverIamUserName,
    });

    const output: ActionOutputs = {};
    output[iamUser.resourceId] = iamUser;

    return output;
  }
}

@Factory<AddServerModelAction>(AddServerModelAction)
export class AddServerModelActionFactory {
  static async create(): Promise<AddServerModelAction> {
    return new AddServerModelAction();
  }
}
