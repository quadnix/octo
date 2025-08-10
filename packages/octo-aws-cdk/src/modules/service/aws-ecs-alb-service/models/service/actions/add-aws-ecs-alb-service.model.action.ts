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
import type { AwsEcsAlbServiceModule } from '../../../aws-ecs-alb-service.module.js';
import { AwsEcsAlbService } from '../aws-ecs-alb-service.model.js';

/**
 * @internal
 */
@Action(AwsEcsAlbService)
export class AddAwsEcsAlbServiceModelAction implements IModelAction<AwsEcsAlbServiceModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsEcsAlbService &&
      hasNodeName(diff.node, 'service') &&
      diff.field === 'serviceId'
    );
  }

  async handle(
    _diff: Diff,
    actionInputs: EnhancedModuleSchema<AwsEcsAlbServiceModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const { awsAccountId, awsAvailabilityZones, awsRegionId } = actionInputs.metadata;

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
    for (const subnet of actionInputs.inputs.subnets) {
      const [matchingSubnetResource] = await subnet.getResourcesMatchingSchema(
        SubnetSchema,
        [
          { key: 'awsAccountId', value: awsAccountId },
          { key: 'awsRegionId', value: awsRegionId },
          { key: 'subnetName', value: subnet.subnetName },
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
@Factory<AddAwsEcsAlbServiceModelAction>(AddAwsEcsAlbServiceModelAction)
export class AddAwsEcsAlbServiceModelActionFactory {
  private static instance: AddAwsEcsAlbServiceModelAction;

  static async create(): Promise<AddAwsEcsAlbServiceModelAction> {
    if (!this.instance) {
      this.instance = new AddAwsEcsAlbServiceModelAction();
    }
    return this.instance;
  }
}
