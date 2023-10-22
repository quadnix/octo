import { Diff, DiffAction, IActionInputs, IActionOutputs } from '@quadnix/octo';
import { IamUser } from '../../../resources/iam/iam-user.resource.js';
import { Action } from '../../action.abstract.js';
import { AwsServer } from '../aws.server.model.js';

export class DeleteServerAction extends Action {
  readonly ACTION_NAME: string = 'DeleteServerAction';

  override collectInput(diff: Diff): string[] {
    const server = diff.model as AwsServer;
    const serverIamUserName = server.getAnchors([])[0].ANCHOR_NAME;

    return [`resource.iam-user-${serverIamUserName}`];
  }

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.DELETE && diff.model.MODEL_NAME === 'server' && diff.field === 'serverKey';
  }

  handle(diff: Diff, actionInputs: IActionInputs): IActionOutputs {
    const server = diff.model as AwsServer;
    const serverIamUserName = server.getAnchors([])[0].ANCHOR_NAME;

    const iamUser = actionInputs[`resource.iam-user-${serverIamUserName}`] as IamUser;

    // Delete IAM User.
    iamUser.markDeleted();

    return {};
  }
}
