import { EC2Client } from '@aws-sdk/client-ec2';
import {
  AModule,
  type AResource,
  type Account,
  BaseResourceSchema,
  Container,
  ContainerRegistrationError,
  Module,
  type Region,
  Schema,
  type Subnet,
  SubnetType,
  Validate,
} from '@quadnix/octo';
import type { AwsCredentialIdentityProvider } from '@smithy/types';
import { AwsSubnet } from './models/subnet/index.js';

class InternetGatewayResourceSchema extends BaseResourceSchema {
  override response = Schema<{
    InternetGatewayId: string;
  }>();
}

class VpcResourceSchema extends BaseResourceSchema {
  override response = Schema<{
    VpcId: string;
  }>();
}

export class AwsSubnetModuleSchema {
  awsRegionAZ = Schema<string>();

  awsRegionId = Schema<string>();

  @Validate({ options: { isResource: { NODE_NAME: 'internet-gateway' } } })
  internetGatewayResource = Schema<AResource<InternetGatewayResourceSchema, any>>();

  region = Schema<Region>();

  subnetCidrBlock = Schema<string>();

  subnetName = Schema<string>();

  subnetOptions? = Schema<{ disableSubnetIntraNetwork: boolean; subnetType: SubnetType }>({
    disableSubnetIntraNetwork: false,
    subnetType: SubnetType.PRIVATE,
  });

  subnetSiblings? = Schema<{ subnetCidrBlock: string; subnetName: string }[]>([]);

  @Validate({ options: { isResource: { NODE_NAME: 'vpc' } } })
  vpcResource = Schema<AResource<VpcResourceSchema, any>>();
}

@Module<AwsSubnetModule>('@octo', AwsSubnetModuleSchema)
export class AwsSubnetModule extends AModule<AwsSubnetModuleSchema, AwsSubnet> {
  async onInit(inputs: AwsSubnetModuleSchema): Promise<AwsSubnet> {
    const region = inputs.region;
    const account = region.getParents()['account'][0].to as Account;

    // Create a new subnet.
    const subnet = new AwsSubnet(region, inputs.subnetName);
    subnet.disableSubnetIntraNetwork = inputs.subnetOptions?.disableSubnetIntraNetwork || false;
    subnet.subnetType = inputs.subnetOptions?.subnetType || SubnetType.PRIVATE;
    region.addSubnet(subnet);

    // Associate subnet with siblings.
    const regionSubnets = (region.getChildren('subnet')['subnet'] || []).map((d) => d.to as Subnet);
    for (const { subnetName } of inputs.subnetSiblings || []) {
      const siblingSubnet = regionSubnets.find((s) => s.subnetName === subnetName);
      if (!siblingSubnet) {
        throw new Error(`Sibling subnet "${subnetName}" not found!`);
      }
      subnet.updateNetworkingRules(siblingSubnet, true);
    }

    // Create and register a new EC2Client.
    const credentials = account.getCredentials() as AwsCredentialIdentityProvider;
    const ec2Client = new EC2Client({ ...credentials, region: inputs.awsRegionId });
    const container = Container.getInstance();
    try {
      container.registerValue(EC2Client, ec2Client, {
        metadata: { awsRegionId: inputs.awsRegionId, package: '@octo' },
      });
    } catch (error) {
      if (!(error instanceof ContainerRegistrationError)) {
        throw error;
      }
    }

    return subnet;
  }
}
