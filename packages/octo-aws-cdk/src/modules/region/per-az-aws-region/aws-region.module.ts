import { EC2Client } from '@aws-sdk/client-ec2';
import { AModule, Account, AccountType, Container, ContainerRegistrationError, Module, Schema } from '@quadnix/octo';
import type { AwsCredentialIdentityProvider } from '@smithy/types';
import { AwsRegion, RegionId } from './models/region/index.js';

export class AwsRegionModuleSchema {
  account = Schema<Account>();

  regionId = Schema<RegionId>();

  vpcCidrBlock = Schema<string>();
}

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

    // Create and register a new EC2Client.
    const credentials = account.getCredentials() as AwsCredentialIdentityProvider;
    const ec2Client = new EC2Client({ ...credentials, region: region.awsRegionId });
    const container = Container.getInstance();
    try {
      container.registerValue(EC2Client, ec2Client, {
        metadata: { awsRegionId: region.awsRegionId, package: '@octo' },
      });
    } catch (error) {
      if (!(error instanceof ContainerRegistrationError)) {
        throw error;
      }
    }

    return region;
  }
}
