import {
  AttachUserPolicyCommand,
  CreatePolicyCommand,
  DeletePolicyCommand,
  DetachUserPolicyCommand,
  IAMClient,
} from '@aws-sdk/client-iam';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction } from '@quadnix/octo';
import type { IIamUserResponse, IIamUserS3BucketPolicy } from '../iam-user.interface.js';
import { type IIamUserPolicyDiff, IamUser, isAddPolicyDiff, isDeletePolicyDiff } from '../iam-user.resource.js';

@Action(IamUser)
export class UpdateIamUserWithS3StoragePolicyResourceAction implements IResourceAction {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.node instanceof IamUser &&
      (diff.node.constructor as typeof IamUser).NODE_NAME === 'iam-user' &&
      diff.field === 's3-storage-access-policy'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const iamUser = diff.node as IamUser;
    const iamUserPolicyDiff = diff.value as IIamUserPolicyDiff;
    const response = iamUser.response;

    // Get instances.
    const iamClient = await Container.get(IAMClient);

    // Attach policies to IAM User to read/write from bucket.
    if (isAddPolicyDiff(iamUserPolicyDiff)) {
      const policyDocument: { Action: string[]; Effect: 'Allow'; Resource: string[]; Sid: string }[] = [];
      const policy = iamUserPolicyDiff.policy as IIamUserS3BucketPolicy;

      if (policy.allowRead) {
        policyDocument.push({
          Action: [
            's3:GetObject',
            's3:GetObjectAttributes',
            's3:GetObjectTagging',
            's3:GetObjectVersionAcl',
            's3:GetObjectVersionAttributes',
            's3:GetObjectVersionTagging',
            's3:ListBucket',
          ],
          Effect: 'Allow',
          Resource:
            policy.remoteDirectoryPath === '' || policy.remoteDirectoryPath === '/'
              ? [`arn:aws:s3:::${policy.bucketName}`, `arn:aws:s3:::${policy.bucketName}/*`]
              : [
                  `arn:aws:s3:::${policy.bucketName}/${policy.remoteDirectoryPath}`,
                  `arn:aws:s3:::${policy.bucketName}/${policy.remoteDirectoryPath}/*`,
                ],
          Sid: `Allow read from bucket ${policy.bucketName}`,
        });
      }
      if (policy.allowWrite) {
        policyDocument.push({
          Action: ['s3:PutObject', 's3:DeleteObjectVersion', 's3:DeleteObject'],
          Effect: 'Allow',
          Resource:
            policy.remoteDirectoryPath === '' || policy.remoteDirectoryPath === '/'
              ? [`arn:aws:s3:::${policy.bucketName}`, `arn:aws:s3:::${policy.bucketName}/*`]
              : [`arn:aws:s3:::${policy.bucketName}/${policy.remoteDirectoryPath}/*`],
          Sid: `Allow write from bucket ${policy.bucketName}`,
        });
      }

      const data = await iamClient.send(
        new CreatePolicyCommand({
          PolicyDocument: JSON.stringify({
            Statement: policyDocument,
          }),
          PolicyName: iamUserPolicyDiff.policyId,
        }),
      );
      await iamClient.send(
        new AttachUserPolicyCommand({
          PolicyArn: data.Policy!.Arn,
          UserName: response.UserName,
        }),
      );

      // Set response.
      response.policies[iamUserPolicyDiff.policyId] = [data.Policy!.Arn!];
    } else if (isDeletePolicyDiff(iamUserPolicyDiff)) {
      const policyARNs = response.policies[iamUserPolicyDiff.policyId] || [];
      await Promise.all(
        policyARNs.map(async (policyArn) => {
          await iamClient.send(
            new DetachUserPolicyCommand({
              PolicyArn: policyArn,
              UserName: response.UserName,
            }),
          );
          await iamClient.send(
            new DeletePolicyCommand({
              PolicyArn: policyArn,
            }),
          );
        }),
      );

      // Set response.
      delete response.policies[iamUserPolicyDiff.policyId];
    }
  }

  async mock(capture: Partial<IIamUserResponse>, diff: Diff): Promise<void> {
    const iamUserPolicyDiff = diff.value as IIamUserPolicyDiff;

    const iamClient = await Container.get(IAMClient);
    iamClient.send = async (instance): Promise<unknown> => {
      if (instance instanceof CreatePolicyCommand) {
        return { Policy: { Arn: capture.policies![iamUserPolicyDiff.policyId][0] } };
      } else if (instance instanceof AttachUserPolicyCommand) {
        return;
      } else if (instance instanceof DetachUserPolicyCommand) {
        return;
      } else if (instance instanceof DeletePolicyCommand) {
        return;
      }
    };
  }
}

@Factory<UpdateIamUserWithS3StoragePolicyResourceAction>(UpdateIamUserWithS3StoragePolicyResourceAction)
export class UpdateIamUserWithS3StoragePolicyResourceActionFactory {
  static async create(): Promise<UpdateIamUserWithS3StoragePolicyResourceAction> {
    return new UpdateIamUserWithS3StoragePolicyResourceAction();
  }
}