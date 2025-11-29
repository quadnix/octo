import {
  GetPolicyCommand,
  GetPolicyVersionCommand,
  GetUserCommand,
  type GetUserCommandOutput,
  IAMClient,
  ListAttachedUserPoliciesCommand,
} from '@aws-sdk/client-iam';
import {
  ANodeAction,
  Action,
  type Diff,
  DiffAction,
  Factory,
  type IResourceAction,
  TransactionError,
  hasNodeName,
} from '@quadnix/octo';
import type { IAMClientFactory } from '../../../factories/aws-client.factory.js';
import { PolicyUtility } from '../../../utilities/policy/policy.utility.js';
import { IamUser } from '../iam-user.resource.js';
import type { IIamUserS3BucketPolicy } from '../index.schema.js';

/**
 * @internal
 */
@Action(IamUser)
export class ValidateIamUserResourceAction extends ANodeAction implements IResourceAction<IamUser> {
  constructor() {
    super();
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.VALIDATE &&
      diff.node instanceof IamUser &&
      hasNodeName(diff.node, 'iam-user') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<IamUser>): Promise<void> {
    // Get properties.
    const iamUser = diff.node;
    const properties = iamUser.properties;
    const response = iamUser.response;

    // Get instances.
    const iamClient = await this.container.get<IAMClient, typeof IAMClientFactory>(IAMClient, {
      args: [properties.awsAccountId],
      metadata: { package: '@octo' },
    });

    // Check if IAM User exists.
    let getUserResult: GetUserCommandOutput | undefined;
    try {
      getUserResult = await iamClient.send(
        new GetUserCommand({
          UserName: response.UserName!,
        }),
      );
    } catch (error: any) {
      if (error.name === 'NoSuchEntity') {
        throw new TransactionError(`IAM User with name ${response.UserName} does not exist!`);
      }
      throw error;
    }

    const actualUser = getUserResult.User!;

    // Validate user name.
    if (actualUser.UserName !== properties.username) {
      throw new TransactionError(
        `IAM User name mismatch. Expected: ${properties.username}, Actual: ${actualUser.UserName || 'undefined'}`,
      );
    }

    // Validate user ID.
    if (actualUser.UserId !== response.UserId) {
      throw new TransactionError(
        `IAM User ID mismatch. Expected: ${response.UserId}, Actual: ${actualUser.UserId || 'undefined'}`,
      );
    }

    // Validate user ARN.
    if (actualUser.Arn !== response.Arn) {
      throw new TransactionError(
        `IAM User ARN mismatch. Expected: ${response.Arn}, Actual: ${actualUser.Arn || 'undefined'}`,
      );
    }

    // Validate ARN format (account should match).
    const expectedArnPrefix = `arn:aws:iam::${properties.awsAccountId}:user/`;
    if (!response.Arn!.startsWith(expectedArnPrefix)) {
      throw new TransactionError(
        `IAM User ARN account mismatch. Expected prefix: ${expectedArnPrefix}, Actual: ${response.Arn}`,
      );
    }

    // Validate attached policies.
    const listAttachedPoliciesResult = await iamClient.send(
      new ListAttachedUserPoliciesCommand({
        UserName: response.UserName,
      }),
    );

    const attachedPolicies = listAttachedPoliciesResult.AttachedPolicies || [];
    const expectedPolicyArns = new Set<string>();

    // Collect all expected policy ARNs from response.
    if (response.policies) {
      for (const policyArns of Object.values(response.policies)) {
        for (const arn of policyArns) {
          expectedPolicyArns.add(arn);
        }
      }
    }

    // Validate policy count matches.
    if (attachedPolicies.length !== expectedPolicyArns.size) {
      throw new TransactionError(
        `IAM User attached policy count mismatch. Expected: ${expectedPolicyArns.size}, Actual: ${attachedPolicies.length}`,
      );
    }

    // Validate each expected policy is attached.
    for (const expectedArn of expectedPolicyArns) {
      const attachedPolicy = attachedPolicies.find((p) => p.PolicyArn === expectedArn);
      if (!attachedPolicy) {
        throw new TransactionError(
          `IAM User missing attached policy: ${expectedArn}. Current policies: ${JSON.stringify(attachedPolicies.map((p) => p.PolicyArn))}`,
        );
      }
    }

    // Validate S3 storage access policies in detail.
    const s3StoragePolicies = properties.policies.filter((p) => p.policyType === 's3-storage-access-policy');
    for (const s3Policy of s3StoragePolicies) {
      const policyArns = response.policies?.[s3Policy.policyId];
      if (!policyArns || policyArns.length === 0) {
        throw new TransactionError(`IAM User response missing policy ARN for S3 storage policy: ${s3Policy.policyId}`);
      }

      const policyArn = policyArns[0];

      // Get policy version.
      const getPolicyResult = await iamClient.send(
        new GetPolicyCommand({
          PolicyArn: policyArn,
        }),
      );

      const policyVersion = getPolicyResult.Policy!.DefaultVersionId!;

      // Get policy document.
      const getPolicyVersionResult = await iamClient.send(
        new GetPolicyVersionCommand({
          PolicyArn: policyArn,
          VersionId: policyVersion,
        }),
      );

      const policyDocument = JSON.parse(decodeURIComponent(getPolicyVersionResult.PolicyVersion!.Document!));
      const policy = s3Policy.policy as IIamUserS3BucketPolicy;

      // Validate policy statements.
      const expectedS3Statements: { Action: string[]; Effect: 'Allow'; Resource: string[]; Sid: string }[] = [];

      if (policy.allowRead) {
        expectedS3Statements.push({
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
        expectedS3Statements.push({
          Action: ['s3:PutObject', 's3:DeleteObjectVersion', 's3:DeleteObject'],
          Effect: 'Allow',
          Resource:
            policy.remoteDirectoryPath === '' || policy.remoteDirectoryPath === '/'
              ? [`arn:aws:s3:::${policy.bucketName}`, `arn:aws:s3:::${policy.bucketName}/*`]
              : [`arn:aws:s3:::${policy.bucketName}/${policy.remoteDirectoryPath}/*`],
          Sid: PolicyUtility.getSafeSid(`Allow write from bucket ${policy.bucketName}`),
        });
      }

      if (policyDocument.Statement?.length !== expectedS3Statements.length) {
        throw new TransactionError(
          `S3 storage policy ${s3Policy.policyId} statement count mismatch. Expected: ${expectedS3Statements.length}, Actual: ${policyDocument.Statement?.length || 0}`,
        );
      }

      for (const expectedStatement of expectedS3Statements) {
        const matchingStatement = policyDocument.Statement?.find(
          (statement: any) =>
            statement.Sid === expectedStatement.Sid &&
            statement.Effect === expectedStatement.Effect &&
            JSON.stringify(statement.Action) === JSON.stringify(expectedStatement.Action) &&
            JSON.stringify(statement.Resource) === JSON.stringify(expectedStatement.Resource),
        );

        if (!matchingStatement) {
          throw new TransactionError(
            `S3 storage policy ${s3Policy.policyId} missing statement with Sid: ${expectedStatement.Sid}`,
          );
        }
      }
    }
  }
}

/**
 * @internal
 */
@Factory<ValidateIamUserResourceAction>(ValidateIamUserResourceAction)
export class ValidateIamUserResourceActionFactory {
  private static instance: ValidateIamUserResourceAction;

  static async create(): Promise<ValidateIamUserResourceAction> {
    if (!this.instance) {
      this.instance = new ValidateIamUserResourceAction();
    }
    return this.instance;
  }
}
