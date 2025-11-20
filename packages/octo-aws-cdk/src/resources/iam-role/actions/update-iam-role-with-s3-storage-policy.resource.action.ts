import {
  AttachRolePolicyCommand,
  CreatePolicyCommand,
  DeletePolicyCommand,
  DetachRolePolicyCommand,
  IAMClient,
} from '@aws-sdk/client-iam';
import { Action, Container, type Diff, DiffAction, Factory, type IResourceAction, hasNodeName } from '@quadnix/octo';
import type { IAMClientFactory } from '../../../factories/aws-client.factory.js';
import { PolicyUtility } from '../../../utilities/policy/policy.utility.js';
import { type IIamRolePolicyDiff, IamRole, isAddPolicyDiff, isDeletePolicyDiff } from '../iam-role.resource.js';
import type { IIamRoleS3BucketPolicy, IamRoleSchema } from '../index.schema.js';

/**
 * @internal
 */
@Action(IamRole)
export class UpdateIamRoleWithS3StoragePolicyResourceAction implements IResourceAction<IamRole> {
  constructor(private readonly container: Container) {}

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.UPDATE &&
      diff.node instanceof IamRole &&
      hasNodeName(diff.node, 'iam-role') &&
      diff.field === 's3-storage-access-policy'
    );
  }

  async handle(diff: Diff<IamRole, IIamRolePolicyDiff>): Promise<IamRoleSchema['response']> {
    // Get properties.
    const iamRole = diff.node;
    const properties = iamRole.properties;
    const response = iamRole.response;
    const iamRolePolicyDiff = diff.value;

    // Get instances.
    const iamClient = await this.container.get<IAMClient, typeof IAMClientFactory>(IAMClient, {
      args: [properties.awsAccountId],
      metadata: { package: '@octo' },
    });

    // Attach policies to IAM Role to read/write from bucket.
    if (isAddPolicyDiff(iamRolePolicyDiff)) {
      const policyDocument: { Action: string[]; Effect: 'Allow'; Resource: string[]; Sid: string }[] = [];
      const policy = iamRolePolicyDiff.policy as IIamRoleS3BucketPolicy;

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
          Sid: PolicyUtility.getSafeSid(`Allow read from bucket ${policy.bucketName}`),
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
          Sid: PolicyUtility.getSafeSid(`Allow write from bucket ${policy.bucketName}`),
        });
      }

      const data = await iamClient.send(
        new CreatePolicyCommand({
          PolicyDocument: JSON.stringify({
            Statement: policyDocument,
            Version: '2012-10-17',
          }),
          PolicyName: iamRolePolicyDiff.policyId,
        }),
      );
      await iamClient.send(
        new AttachRolePolicyCommand({
          PolicyArn: data.Policy!.Arn,
          RoleName: response.RoleName,
        }),
      );

      // Set response.
      if (!response.policies) {
        response.policies = {};
      }
      response.policies![iamRolePolicyDiff.policyId] = [data.Policy!.Arn!];
    } else if (isDeletePolicyDiff(iamRolePolicyDiff)) {
      const policyARNs = response.policies![iamRolePolicyDiff.policyId] || [];
      await Promise.all(
        policyARNs.map(async (policyArn) => {
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
      if (!Object.isFrozen(response)) {
        delete response.policies![iamRolePolicyDiff.policyId];
      }
    }

    return response;
  }

  async mock(
    diff: Diff<IamRole, IIamRolePolicyDiff>,
    capture: Partial<IamRoleSchema['response']>,
  ): Promise<IamRoleSchema['response']> {
    // Get properties.
    const iamRole = diff.node;
    const response = iamRole.response;
    const iamRolePolicyDiff = diff.value;

    // Attach policies to IAM Role to read/write from bucket.
    if (isAddPolicyDiff(iamRolePolicyDiff)) {
      if (!response.policies) {
        response.policies = {};
      }
      response.policies![iamRolePolicyDiff.policyId] = [capture.policies![iamRolePolicyDiff.policyId][0]];
    } else if (isDeletePolicyDiff(iamRolePolicyDiff)) {
      if (!Object.isFrozen(response)) {
        delete response.policies![iamRolePolicyDiff.policyId];
      }
    }

    return response;
  }
}

/**
 * @internal
 */
@Factory<UpdateIamRoleWithS3StoragePolicyResourceAction>(UpdateIamRoleWithS3StoragePolicyResourceAction)
export class UpdateIamRoleWithS3StoragePolicyResourceActionFactory {
  private static instance: UpdateIamRoleWithS3StoragePolicyResourceAction;

  static async create(): Promise<UpdateIamRoleWithS3StoragePolicyResourceAction> {
    if (!this.instance) {
      const container = Container.getInstance();
      this.instance = new UpdateIamRoleWithS3StoragePolicyResourceAction(container);
    }
    return this.instance;
  }
}
