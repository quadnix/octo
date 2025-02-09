import { EC2Client } from '@aws-sdk/client-ec2';
import { ECRClient } from '@aws-sdk/client-ecr';
import { ECSClient } from '@aws-sdk/client-ecs';
import { EFSClient } from '@aws-sdk/client-efs';
import { IAMClient } from '@aws-sdk/client-iam';
import { S3Client } from '@aws-sdk/client-s3';
import { STSClient } from '@aws-sdk/client-sts';
import { Upload } from '@aws-sdk/lib-storage';
import { Container, Factory } from '@quadnix/octo';
import type { AwsCredentialIdentityProvider } from '@smithy/types';

class AwsClientFactory {
  private static instances: { [key: string]: { awsAccountId: string; awsRegionId: string; value: any }[] } = {};

  static async create(awsAccountId: string, awsRegionId: string): Promise<any> {
    if (!awsAccountId || !awsRegionId) {
      throw new Error(`Failed to create instance of ${this.name} due to insufficient arguments!`);
    }
    if (!this.instances[this.name]) {
      this.instances[this.name] = [];
    }

    let instanceIndex = this.instances[this.name].findIndex(
      (i) => i.awsAccountId === awsAccountId && i.awsRegionId === awsRegionId,
    );
    if (instanceIndex === -1) {
      const container = Container.getInstance();
      const credentials = await container.get<AwsCredentialIdentityProvider>('AwsCredentialIdentityProvider', {
        metadata: { awsAccountId, package: '@octo' },
      });
      this.instances[this.name].push({
        awsAccountId,
        awsRegionId,
        value: this.createInstance(awsRegionId, credentials),
      });
      instanceIndex = this.instances[this.name].length - 1;
    }

    return this.instances[this.name][instanceIndex].value;
  }

  static createInstance(...args: unknown[]): any {
    if (args.length > 2) {
      throw new Error('Invalid number of args in createInstance()!');
    }

    throw new Error('Method not implemented! Use derived class implementation');
  }
}

@Factory<EC2Client>(EC2Client, { metadata: { package: '@octo' } })
export class EC2ClientFactory extends AwsClientFactory {
  static override createInstance(awsRegionId: string, credentials: AwsCredentialIdentityProvider): EC2Client {
    return new EC2Client({ ...credentials, region: awsRegionId });
  }
}

@Factory<ECRClient>(ECRClient, { metadata: { package: '@octo' } })
export class ECRClientFactory extends AwsClientFactory {
  static override createInstance(awsRegionId: string, credentials: AwsCredentialIdentityProvider): ECRClient {
    return new ECRClient({ ...credentials, region: awsRegionId });
  }
}

@Factory<ECSClient>(ECSClient, { metadata: { package: '@octo' } })
export class ECSClientFactory extends AwsClientFactory {
  static override createInstance(awsRegionId: string, credentials: AwsCredentialIdentityProvider): ECSClient {
    return new ECSClient({ ...credentials, region: awsRegionId });
  }
}

@Factory<EFSClient>(EFSClient, { metadata: { package: '@octo' } })
export class EFSClientFactory extends AwsClientFactory {
  static override createInstance(awsRegionId: string, credentials: AwsCredentialIdentityProvider): EFSClient {
    return new EFSClient({ ...credentials, region: awsRegionId });
  }
}

@Factory<IAMClient>(IAMClient, { metadata: { package: '@octo' } })
export class IAMClientFactory extends AwsClientFactory {
  static override async create(awsAccountId: string): Promise<IAMClient> {
    return super.create(awsAccountId, 'global');
  }

  static override createInstance(_awsRegionId: string, credentials: AwsCredentialIdentityProvider): IAMClient {
    return new IAMClient({ ...credentials });
  }
}

@Factory<S3Client>(S3Client, { metadata: { package: '@octo' } })
export class S3ClientFactory extends AwsClientFactory {
  static override createInstance(awsRegionId: string, credentials: AwsCredentialIdentityProvider): S3Client {
    return new S3Client({ ...credentials, region: awsRegionId });
  }
}

@Factory<typeof Upload>('Upload', { metadata: { package: '@octo' } })
export class S3UploadClientFactory {
  static async create(): Promise<typeof Upload> {
    return Upload;
  }
}

@Factory<STSClient>(STSClient, { metadata: { package: '@octo' } })
export class STSClientFactory extends AwsClientFactory {
  static override async create(awsAccountId: string): Promise<STSClient> {
    return super.create(awsAccountId, 'global');
  }

  static override createInstance(_awsRegionId: string, credentials: AwsCredentialIdentityProvider): STSClient {
    return new STSClient({ ...credentials });
  }
}
