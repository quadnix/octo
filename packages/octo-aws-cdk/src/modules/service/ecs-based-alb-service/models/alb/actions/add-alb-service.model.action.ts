import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
  MatchingResource,
  hasNodeName,
} from '@quadnix/octo';
import { Alb } from '../../../../../../resources/alb/index.js';
import { SecurityGroup } from '../../../../../../resources/security-group/index.js';
import { SubnetSchema } from '../../../../../../resources/subnet/index.schema.js';
import { VpcSchema } from '../../../../../../resources/vpc/index.schema.js';
import type { AwsAlbServiceModule } from '../../../aws-alb.service.module.js';
import { AwsAlbService } from '../aws-alb.service.model.js';

/**
 * @internal
 */
@Action(AwsAlbService)
export class AddAlbServiceModelAction implements IModelAction<AwsAlbServiceModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsAlbService &&
      hasNodeName(diff.node, 'service') &&
      diff.field === 'serviceId'
    );
  }

  async handle(
    _diff: Diff,
    actionInputs: EnhancedModuleSchema<AwsAlbServiceModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const { awsAccountId, awsAvailabilityZones, awsRegionId, subnets } = actionInputs.metadata;

    const [matchingVpcResource] = await actionInputs.inputs.region.getResourcesMatchingSchema(
      VpcSchema,
      [
        { key: 'awsAccountId', value: awsAccountId },
        { key: 'awsRegionId', value: awsRegionId },
      ],
      [],
      { searchBoundaryMembers: false },
    );

    const matchingSubnetResources: MatchingResource<SubnetSchema>[] = [];
    for (const subnetInput of actionInputs.inputs.subnets) {
      const { subnetCidrBlock, subnetName } = subnetInput;
      const subnet = subnets.find((s) => s.subnetName === subnetName)!;
      const [matchingSubnetResource] = await subnet.getResourcesMatchingSchema(
        SubnetSchema,
        [
          { key: 'awsAccountId', value: awsAccountId },
          { key: 'awsRegionId', value: awsRegionId },
          { key: 'CidrBlock', value: subnetCidrBlock },
          { key: 'subnetName', value: subnetName },
        ],
        [],
        { searchBoundaryMembers: false },
      );

      // Validate subnet availability zone.
      if (!awsAvailabilityZones.includes(matchingSubnetResource.getSchemaInstance().properties.AvailabilityZone)) {
        throw new Error('Invalid subnet availability zone!');
      }

      matchingSubnetResources.push(matchingSubnetResource);
    }

    // Create ALB security group.
    const albSG = new SecurityGroup(
      `sec-grp-${actionInputs.inputs.region.regionId}-${actionInputs.inputs.albName}`,
      {
        awsAccountId,
        awsRegionId,
        rules: [
          {
            CidrBlock: '0.0.0.0/0',
            Egress: false,
            FromPort: 80,
            IpProtocol: 'tcp',
            ToPort: 80,
          },
          {
            CidrBlock: '0.0.0.0/0',
            Egress: true,
            FromPort: 0,
            IpProtocol: 'tcp',
            ToPort: 65535,
          },
        ],
      },
      [matchingVpcResource],
    );

    // Create ALB.
    const alb = new Alb(
      `alb-${actionInputs.inputs.region.regionId}-${actionInputs.inputs.albName}`,
      {
        awsAccountId,
        awsRegionId,
        IpAddressType: 'dualstack',
        Name: actionInputs.inputs.albName,
        Scheme: 'internet-facing',
        Type: 'application',
      },
      [new MatchingResource(albSG), ...matchingSubnetResources],
    );

    actionOutputs[albSG.resourceId] = albSG;
    actionOutputs[alb.resourceId] = alb;
    return actionOutputs;
  }
}

/**
 * @internal
 */
@Factory<AddAlbServiceModelAction>(AddAlbServiceModelAction)
export class AddAlbServiceModelActionFactory {
  private static instance: AddAlbServiceModelAction;

  static async create(): Promise<AddAlbServiceModelAction> {
    if (!this.instance) {
      this.instance = new AddAlbServiceModelAction();
    }
    return this.instance;
  }
}
