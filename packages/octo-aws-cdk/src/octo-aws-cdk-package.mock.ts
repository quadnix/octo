import { EC2Client } from '@aws-sdk/client-ec2';
import { ECRClient } from '@aws-sdk/client-ecr';
import { ECSClient } from '@aws-sdk/client-ecs';
import { EFSClient } from '@aws-sdk/client-efs';
import { IAMClient } from '@aws-sdk/client-iam';
import { S3Client } from '@aws-sdk/client-s3';
import { STSClient } from '@aws-sdk/client-sts';
import type { IPackageMock } from '@quadnix/octo';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import * as process from 'process';
import { ProcessUtility } from './utilities/process/process.utility.js';
import { RetryUtility } from './utilities/retry/retry.utility.js';

const emptyAwsFn = (): void => {
  throw new Error('Trying to execute real AWS resources in mock mode!');
};

const originalMethodRunDetachedProcess = ProcessUtility.runDetachedProcess;

export class OctoAwsCdkPackageMock implements IPackageMock {
  async destroy(): Promise<void> {
    ProcessUtility.runDetachedProcess = originalMethodRunDetachedProcess;

    RetryUtility.setDefaults({
      backOffFactor: 1,
      initialDelayInMs: 10000,
      maxRetries: 3,
      retryDelayInMs: 10000,
      throwOnError: true,
    });
  }

  getMocks(): ReturnType<IPackageMock['getMocks']> {
    return [
      {
        type: EC2Client,
        value: { send: emptyAwsFn },
      },
      {
        type: ECRClient,
        value: { send: emptyAwsFn },
      },
      {
        type: ECSClient,
        value: { send: emptyAwsFn },
      },
      {
        type: EFSClient,
        value: { send: emptyAwsFn },
      },
      {
        type: IAMClient,
        value: { send: emptyAwsFn },
      },
      {
        type: S3Client,
        value: { send: emptyAwsFn },
      },
      {
        type: STSClient,
        value: { send: emptyAwsFn },
      },
    ];
  }

  async init(): Promise<void> {
    ProcessUtility.runDetachedProcess = (): ChildProcessWithoutNullStreams => {
      const command = process.platform === 'win32' ? 'dir' : 'ls';
      return originalMethodRunDetachedProcess(command, { shell: true }, 'pipe');
    };

    RetryUtility.setDefaults({ initialDelayInMs: 0 });
  }
}
