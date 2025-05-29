import { AModule, type Account, type App, Module, type Service, type Subnet, SubnetType } from '@quadnix/octo';
import { AwsRegionAnchorSchema } from '../../../anchors/aws-region/aws-region.anchor.schema.js';
import { AwsAlbServiceModuleSchema } from './index.schema.js';
import { AwsAlbService } from './models/alb/index.js';

@Module<AwsAlbServiceModule>('@octo', AwsAlbServiceModuleSchema)
export class AwsAlbServiceModule extends AModule<AwsAlbServiceModuleSchema, AwsAlbService> {
  async onInit(inputs: AwsAlbServiceModuleSchema): Promise<AwsAlbService> {
    const region = inputs.region;
    const { app, subnets } = await this.registerMetadata(inputs);

    // Validate ALB name.
    const services = (app.getChildren('service')['service'] || []).map((d) => d.to as Service);
    if (services.find((s) => s.serviceId === `${inputs.albName}-alb`)) {
      throw new Error(`ALB "${inputs.albName}" already exists!`);
    }

    // Validate subnet.
    for (const { subnetName } of inputs.subnets || []) {
      const regionSubnet = subnets.find((s) => s.subnetName === subnetName);
      if (!regionSubnet) {
        throw new Error(`Subnet "${subnetName}" not found in region "${region.regionId}"!`);
      }
      if (regionSubnet.subnetType !== SubnetType.PUBLIC) {
        throw new Error(`Subnet "${subnetName}" is not public!`);
      }
    }

    // Create a new ALB.
    const service = new AwsAlbService(inputs.albName);
    app.addService(service);

    return service;
  }

  override async registerMetadata(inputs: AwsAlbServiceModuleSchema): Promise<{
    app: App;
    awsAccountId: string;
    awsAvailabilityZones: string[];
    awsRegionId: string;
    subnets: Subnet[];
  }> {
    const region = inputs.region;
    const account = region.getParents()['account'][0].to as Account;
    const app = account.getParents()['app'][0].to as App;
    const subnets = (region.getChildren('subnet')['subnet'] || []).map((d) => d.to as Subnet);

    // Get AWS Region ID.
    const [matchingAnchor] = await region.getAnchorsMatchingSchema(AwsRegionAnchorSchema, [], {
      searchBoundaryMembers: false,
    });
    const { awsRegionAZs, awsRegionId } = matchingAnchor.getSchemaInstance().properties;

    return {
      app,
      awsAccountId: account.accountId,
      awsAvailabilityZones: awsRegionAZs,
      awsRegionId,
      subnets,
    };
  }
}
