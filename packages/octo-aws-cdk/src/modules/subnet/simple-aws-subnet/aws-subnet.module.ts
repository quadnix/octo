import { EC2Client } from '@aws-sdk/client-ec2';
import {
  AModule,
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

export class InternetGatewayResourceSchema extends BaseResourceSchema {
  @Validate({ destruct: (value): string[] => [value.InternetGatewayId], options: { minLength: 1 } })
  override response = Schema<{
    InternetGatewayId: string;
  }>();
}

export class VpcResourceSchema extends BaseResourceSchema {
  @Validate({
    destruct: (value): string[] => [value.awsAvailabilityZones, value.awsRegionId],
    options: { minLength: 1 },
  })
  override properties = Schema<{
    awsAvailabilityZones: string[];
    awsRegionId: string;
  }>();

  @Validate({ destruct: (value): string[] => [value.VpcId], options: { minLength: 1 } })
  override response = Schema<{
    VpcId: string;
  }>();
}

export class AwsSubnetModuleSchema {
  region = Schema<Region>();

  subnetAvailabilityZone = Schema<string>();

  subnetCidrBlock = Schema<string>();

  subnetName = Schema<string>();

  subnetOptions? = Schema<{ disableSubnetIntraNetwork: boolean; subnetType: SubnetType }>({
    disableSubnetIntraNetwork: false,
    subnetType: SubnetType.PRIVATE,
  });

  subnetSiblings? = Schema<{ subnetCidrBlock: string; subnetName: string }[]>([]);
}

@Module<AwsSubnetModule>('@octo', AwsSubnetModuleSchema)
export class AwsSubnetModule extends AModule<AwsSubnetModuleSchema, AwsSubnet> {
  async onInit(inputs: AwsSubnetModuleSchema): Promise<AwsSubnet> {
    const region = inputs.region;
    const account = region.getParents()['account'][0].to as Account;

    // Get AWS AZs and Region ID.
    const [resourceSynth] = (await region.getResourceMatchingSchema(VpcResourceSchema))!;
    const awsAvailabilityZones = resourceSynth.properties.awsAvailabilityZones;
    const awsRegionId = resourceSynth.properties.awsRegionId;

    // Validate subnet availability zone.
    if (!awsAvailabilityZones.includes(inputs.subnetAvailabilityZone)) {
      throw new Error('Invalid subnet availability zone!');
    }

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
    const ec2Client = new EC2Client({ ...credentials, region: awsRegionId });
    const container = Container.getInstance();
    try {
      container.registerValue(EC2Client, ec2Client, {
        metadata: { awsRegionId, package: '@octo' },
      });
    } catch (error) {
      if (!(error instanceof ContainerRegistrationError)) {
        throw error;
      }
    }

    return subnet;
  }
}
