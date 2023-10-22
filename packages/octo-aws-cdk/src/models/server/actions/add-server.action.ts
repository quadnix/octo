import { Diff, DiffAction, IActionOutputs } from '@quadnix/octo';
import { IamUser } from '../../../resources/iam/iam-user.resource.js';
import { Action } from '../../action.abstract.js';
import { AwsServer } from '../aws.server.model.js';

export class AddServerAction extends Action {
  readonly ACTION_NAME: string = 'AddServerAction';

  override collectOutput(diff: Diff): string[] {
    const server = diff.model as AwsServer;
    const serverIamUserName = server.getAnchors([])[0].ANCHOR_NAME;

    return [`iam-user-${serverIamUserName}`];
  }

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'server' && diff.field === 'serverKey';
  }

  handle(diff: Diff): IActionOutputs {
    const server = diff.model as AwsServer;
    const serverIamUserName = server.getAnchors([])[0].ANCHOR_NAME;

    // Create IAM User.
    const iamUser = new IamUser(`iam-user-${serverIamUserName}`, {
      username: serverIamUserName,
    });

    const output: IActionOutputs = {};
    output[iamUser.resourceId] = iamUser;

    return output;
  }
}
