import { EC2Client } from '@aws-sdk/client-ec2';
import { ECRClient } from '@aws-sdk/client-ecr';
import { ECSClient } from '@aws-sdk/client-ecs';
import { EFSClient } from '@aws-sdk/client-efs';
import { ElasticLoadBalancingV2Client } from '@aws-sdk/client-elastic-load-balancing-v2';
import { IAMClient } from '@aws-sdk/client-iam';
import { ResourceGroupsTaggingAPIClient } from '@aws-sdk/client-resource-groups-tagging-api';
import { S3Client } from '@aws-sdk/client-s3';
import { STSClient } from '@aws-sdk/client-sts';
import { Upload } from '@aws-sdk/lib-storage';
import { Container, Factory } from '@quadnix/octo';
import type { EndpointInputConfig } from '@smithy/middleware-endpoint/dist-types/resolveEndpointConfig.js';
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

      let endpointInputConfig: EndpointInputConfig | undefined;
      if (container.has('EndpointInputConfig', { metadata: { awsAccountId, package: '@octo' } })) {
        endpointInputConfig = await container.get<EndpointInputConfig>('EndpointInputConfig', {
          metadata: { awsAccountId, package: '@octo' },
        });
      }

      this.instances[this.name].push({
        awsAccountId,
        awsRegionId,
        value: this.createInstance(awsRegionId, credentials, endpointInputConfig),
      });
      instanceIndex = this.instances[this.name].length - 1;
    }

    return this.instances[this.name][instanceIndex].value;
  }

  static createInstance(...args: unknown[]): any {
    if (args.length > 3) {
      throw new Error('Invalid number of args in createInstance()!');
    }

    throw new Error('Method not implemented! Use derived class implementation');
  }
}

/**
 * @internal
 */
@Factory<EC2Client>(EC2Client, { metadata: { package: '@octo' } })
export class EC2ClientFactory extends AwsClientFactory {
  static override createInstance(
    awsRegionId: string,
    credentials: AwsCredentialIdentityProvider,
    endpointInputConfig: EndpointInputConfig = {},
  ): EC2Client {
    return new EC2Client({ ...credentials, ...endpointInputConfig, region: awsRegionId });
  }
}

/**
 * @internal
 */
@Factory<ECRClient>(ECRClient, { metadata: { package: '@octo' } })
export class ECRClientFactory extends AwsClientFactory {
  static override createInstance(
    awsRegionId: string,
    credentials: AwsCredentialIdentityProvider,
    endpointInputConfig: EndpointInputConfig = {},
  ): ECRClient {
    return new ECRClient({ ...credentials, ...endpointInputConfig, region: awsRegionId });
  }
}

/**
 * @internal
 */
@Factory<ECSClient>(ECSClient, { metadata: { package: '@octo' } })
export class ECSClientFactory extends AwsClientFactory {
  static override createInstance(
    awsRegionId: string,
    credentials: AwsCredentialIdentityProvider,
    endpointInputConfig: EndpointInputConfig = {},
  ): ECSClient {
    return new ECSClient({ ...credentials, ...endpointInputConfig, region: awsRegionId });
  }
}

/**
 * @internal
 */
@Factory<EFSClient>(EFSClient, { metadata: { package: '@octo' } })
export class EFSClientFactory extends AwsClientFactory {
  static override createInstance(
    awsRegionId: string,
    credentials: AwsCredentialIdentityProvider,
    endpointInputConfig: EndpointInputConfig = {},
  ): EFSClient {
    return new EFSClient({ ...credentials, ...endpointInputConfig, region: awsRegionId });
  }
}

/**
 * @internal
 */
@Factory<ElasticLoadBalancingV2Client>(ElasticLoadBalancingV2Client, { metadata: { package: '@octo' } })
export class ElasticLoadBalancingV2ClientFactory extends AwsClientFactory {
  static override createInstance(
    awsRegionId: string,
    credentials: AwsCredentialIdentityProvider,
    endpointInputConfig: EndpointInputConfig = {},
  ): ElasticLoadBalancingV2Client {
    return new ElasticLoadBalancingV2Client({ ...credentials, ...endpointInputConfig, region: awsRegionId });
  }
}

/**
 * @internal
 */
@Factory<IAMClient>(IAMClient, { metadata: { package: '@octo' } })
export class IAMClientFactory extends AwsClientFactory {
  static override async create(awsAccountId: string): Promise<IAMClient> {
    return super.create(awsAccountId, 'global');
  }

  static override createInstance(
    _awsRegionId: string,
    credentials: AwsCredentialIdentityProvider,
    endpointInputConfig: EndpointInputConfig = {},
  ): IAMClient {
    return new IAMClient({ ...credentials, ...endpointInputConfig });
  }
}

/**
 * @internal
 */
@Factory<ResourceGroupsTaggingAPIClient>(ResourceGroupsTaggingAPIClient, { metadata: { package: '@octo' } })
export class ResourceGroupsTaggingAPIClientFactory extends AwsClientFactory {
  static override createInstance(
    awsRegionId: string,
    credentials: AwsCredentialIdentityProvider,
    endpointInputConfig: EndpointInputConfig = {},
  ): ResourceGroupsTaggingAPIClient {
    return new ResourceGroupsTaggingAPIClient({
      ...credentials,
      ...endpointInputConfig,
      region: awsRegionId,
    });
  }
}

/**
 * @internal
 */
@Factory<S3Client>(S3Client, { metadata: { package: '@octo' } })
export class S3ClientFactory extends AwsClientFactory {
  static override createInstance(
    awsRegionId: string,
    credentials: AwsCredentialIdentityProvider,
    endpointInputConfig: EndpointInputConfig = {},
  ): S3Client {
    return new S3Client({
      ...credentials,
      ...endpointInputConfig,
      region: awsRegionId,
    });
  }
}

/**
 * @internal
 */
@Factory<typeof Upload>('Upload', { metadata: { package: '@octo' } })
export class S3UploadClientFactory {
  static async create(): Promise<typeof Upload> {
    return Upload;
  }
}

/**
 * @internal
 */
@Factory<STSClient>(STSClient, { metadata: { package: '@octo' } })
export class STSClientFactory extends AwsClientFactory {
  static override async create(awsAccountId: string): Promise<STSClient> {
    return super.create(awsAccountId, 'global');
  }

  static override createInstance(
    _awsRegionId: string,
    credentials: AwsCredentialIdentityProvider,
    endpointInputConfig: EndpointInputConfig = {},
  ): STSClient {
    return new STSClient({ ...credentials, ...endpointInputConfig });
  }
}
