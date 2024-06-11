import {
  AttachRolePolicyCommand,
  CreatePolicyCommand,
  DeletePolicyCommand,
  DetachRolePolicyCommand,
  IAMClient,
} from '@aws-sdk/client-iam';
import { Action, Container, Diff, DiffAction, Factory, type IResourceAction, ModelType } from '@quadnix/octo';
import type { IS3StorageAccessOverlayProperties } from '../../../overlays/s3-storage-access/s3-storage-access.overlay.interface.js';
import type { IIamRoleResponse } from '../iam-role.interface.js';
import { IamRole, type IamRolePolicyDiff } from '../iam-role.resource.js';

@Action(ModelType.RESOURCE)
export class UpdateIamRoleWithS3StoragePolicyResourceAction implements IResourceAction {
  readonly ACTION_NAME: string = 'UpdateIamRoleWithS3StoragePolicyResourceAction';

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.model instanceof IamRole &&
      diff.model.MODEL_NAME === 'iam-role' &&
      (diff.value as IamRolePolicyDiff['key']).overlay.MODEL_NAME === 's3-storage-access-overlay'
    );
  }

  async handle(diff: Diff): Promise<void> {
    // Get properties.
    const iamRole = diff.model as IamRole;
    const policyAction = (diff.value as IamRolePolicyDiff['key']).action;
    const overlayId = diff.field;
    const overlayProperties = (diff.value as IamRolePolicyDiff['key']).overlay
      .properties as unknown as IS3StorageAccessOverlayProperties;
    const response = iamRole.response as unknown as IIamRoleResponse;

    // Get instances.
    const iamClient = await Container.get(IAMClient);

    // Attach policies to IAM Role to read/write from bucket.
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
        new AttachRolePolicyCommand({
          PolicyArn: data.Policy!.Arn,
          RoleName: response.RoleName,
        }),
      );

      // Set response.
      response.policies[overlayId] = [data.Policy!.Arn!];
    } else if (policyAction === 'delete') {
      const policies = response.policies[overlayId] || [];
      await Promise.all(
        policies.map(async (policyArn) => {
          await iamClient.send(
            new DetachRolePolicyCommand({
              PolicyArn: policyArn,
              RoleName: response.RoleName,
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

@Factory<UpdateIamRoleWithS3StoragePolicyResourceAction>(UpdateIamRoleWithS3StoragePolicyResourceAction)
export class UpdateIamRoleWithS3StoragePolicyResourceActionFactory {
  static async create(): Promise<UpdateIamRoleWithS3StoragePolicyResourceAction> {
    return new UpdateIamRoleWithS3StoragePolicyResourceAction();
  }
}
