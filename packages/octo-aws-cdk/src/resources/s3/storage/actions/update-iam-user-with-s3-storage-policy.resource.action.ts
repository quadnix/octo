import {
  AttachUserPolicyCommand,
  CreatePolicyCommand,
  DeletePolicyCommand,
  DetachUserPolicyCommand,
  IAMClient,
} from '@aws-sdk/client-iam';
import { Action, Container, Diff, DiffAction, Factory, IResourceAction, ModelType } from '@quadnix/octo';
import { IS3StorageAccessOverlayProperties } from '../../../../models/service/s3-storage/s3-storage-access.overlay.interface.js';
import { IIamUserResponse } from '../../../iam/iam-user.interface.js';
import { IamUser, IamUserPolicyDiff } from '../../../iam/iam-user.resource.js';

@Action(ModelType.RESOURCE)
export class UpdateIamUserWithS3StoragePolicyResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'UpdateIamUserWithS3StoragePolicyResourceAction';

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.model.MODEL_NAME === 'iam-user' &&
      (diff.value as IamUserPolicyDiff['key']).action === 'add' &&
      (diff.value as IamUserPolicyDiff['key']).overlay.MODEL_NAME === 's3-storage-access'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const iamUser = diff.model as IamUser;
    const policyAction = (diff.value as IamUserPolicyDiff['key']).action;
    const overlayId = diff.field;
    const overlayProperties = (diff.value as IamUserPolicyDiff['key']).overlay
      .properties as unknown as IS3StorageAccessOverlayProperties;
    const response = iamUser.response as unknown as IIamUserResponse;

    // Get instances.
    const iamClient = await Container.get(IAMClient);

    // Attach policies to IAM User to read/write from bucket.
    if (policyAction === 'add') {
      const policyDocument: { Action: string[]; Effect: 'Allow'; Resource: string[]; Sid: string }[] = [];

      if (overlayProperties.allowRead) {
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
          Resource: [
            `arn:aws:s3:::${overlayProperties.bucketName}/${overlayProperties.remoteDirectoryPath}`,
            `arn:aws:s3:::${overlayProperties.bucketName}/${overlayProperties.remoteDirectoryPath}/*`,
          ],
          Sid: 'Allow read',
        });
      }
      if (overlayProperties.allowWrite) {
        policyDocument.push({
          Action: ['s3:PutObject', 's3:DeleteObjectVersion', 's3:DeleteObject'],
          Effect: 'Allow',
          Resource: [`arn:aws:s3:::${overlayProperties.bucketName}/${overlayProperties.remoteDirectoryPath}/*`],
          Sid: 'Allow write',
        });
      }

      const data = await iamClient.send(
        new CreatePolicyCommand({
          PolicyDocument: JSON.stringify({
            Statement: policyDocument,
          }),
          PolicyName: overlayId,
        }),
      );
      await iamClient.send(
        new AttachUserPolicyCommand({
          PolicyArn: data.Policy!.Arn,
          UserName: response.UserName,
        }),
      );

      // Set response.
      response.policies[overlayId] = [data.Policy!.Arn!];
    } else if (policyAction === 'delete') {
      const policies = response.policies[overlayId] || [];
      await Promise.all(
        policies.map(async (policyArn) => {
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
      delete response.policies[overlayId];
    }
  }
}

@Factory<UpdateIamUserWithS3StoragePolicyResourceAction>(UpdateIamUserWithS3StoragePolicyResourceAction)
export class UpdateIamUserWithS3StoragePolicyResourceActionFactory {
  static async create(): Promise<UpdateIamUserWithS3StoragePolicyResourceAction> {
    return new UpdateIamUserWithS3StoragePolicyResourceAction();
  }
}
