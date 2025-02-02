import { EC2Client } from '@aws-sdk/client-ec2';
import { AModule, AccountType, Container, ContainerRegistrationError, Module } from '@quadnix/octo';
import type { AwsCredentialIdentityProvider } from '@smithy/types';
import { AwsRegionAnchor } from '../../../anchors/aws-region/aws-region.anchor.js';
import { AwsRegionModuleSchema } from './index.schema.js';
import { AwsRegion } from './models/region/index.js';

@Module<AwsRegionModule>('@octo', AwsRegionModuleSchema)
export class AwsRegionModule extends AModule<AwsRegionModuleSchema, AwsRegion> {
  async onInit(inputs: AwsRegionModuleSchema): Promise<AwsRegion> {
    const account = inputs.account;
    if (account.accountType !== AccountType.AWS) {
      throw new Error('Only AWS accounts are supported in this module!');
    }

    // Create a new region.
    const region = new AwsRegion(inputs.regionId);
    account.addRegion(region);

    // Add anchors.
    const awsRegionAnchor = new AwsRegionAnchor(
      'AwsRegionAnchor',
      {
        awsRegionAZs: region.awsRegionAZs,
        awsRegionId: region.awsRegionId,
        regionId: region.regionId,
      },
      region,
    );
    region.addAnchor(awsRegionAnchor);

    // Create and register a new EC2Client.
    const credentials = account.getCredentials() as AwsCredentialIdentityProvider;
    const ec2Client = new EC2Client({ ...credentials, region: region.awsRegionId });
    const container = Container.getInstance();
    try {
      container.registerValue(EC2Client, ec2Client, {
        metadata: { awsAccountId: account.accountId, awsRegionId: region.awsRegionId, package: '@octo' },
      });
    } catch (error) {
      if (!(error instanceof ContainerRegistrationError)) {
        throw error;
      }
    }

    return region;
  }
}
