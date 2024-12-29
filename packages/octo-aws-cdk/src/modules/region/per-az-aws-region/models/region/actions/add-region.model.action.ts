import {
  Action,
  type ActionOutputs,
  type Diff,
  DiffAction,
  type EnhancedModuleSchema,
  Factory,
  type IModelAction,
} from '@quadnix/octo';
import { InternetGateway } from '../../../../../../resources/internet-gateway/index.js';
import { SecurityGroup } from '../../../../../../resources/security-group/index.js';
import { Vpc } from '../../../../../../resources/vpc/index.js';
import { AwsRegionModule } from '../../../aws-region.module.js';
import { AwsRegion } from '../aws.region.model.js';

@Action(AwsRegion)
export class AddRegionModelAction implements IModelAction<AwsRegionModule> {
  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.node instanceof AwsRegion &&
      (diff.node.constructor as typeof AwsRegion).NODE_NAME === 'region' &&
      diff.field === 'regionId'
    );
  }

  async handle(
    diff: Diff,
    actionInputs: EnhancedModuleSchema<AwsRegionModule>,
    actionOutputs: ActionOutputs,
  ): Promise<ActionOutputs> {
    const awsRegion = diff.node as AwsRegion;
    const regionId = awsRegion.regionId;

    const vpcCidrBlock = actionInputs.inputs.vpcCidrBlock;

    // Create VPC.
    const vpc = new Vpc(`vpc-${regionId}`, {
      awsAvailabilityZones: [...awsRegion.awsRegionAZs],
      awsRegionId: awsRegion.awsRegionId,
      CidrBlock: vpcCidrBlock,
      InstanceTenancy: 'default',
    });

    // Create Internet Gateway.
    const internetGateway = new InternetGateway(`igw-${regionId}`, { awsRegionId: awsRegion.awsRegionId }, [vpc]);

    // Create Security Groups.
    const accessSG = new SecurityGroup(
      `sec-grp-${regionId}-access`,
      {
        awsRegionId: awsRegion.awsRegionId,
        rules: [
          // Access SSH from everywhere.
          {
            CidrBlock: '0.0.0.0/0',
            Egress: false,
            FromPort: 22,
            IpProtocol: 'tcp',
            ToPort: 22,
          },
          // Access Consul UI from everywhere.
          {
            CidrBlock: '0.0.0.0/0',
            Egress: false,
            FromPort: 8500,
            IpProtocol: 'tcp',
            ToPort: 8500,
          },
        ],
      },
      [vpc],
    );

    actionOutputs[vpc.resourceId] = vpc;
    actionOutputs[internetGateway.resourceId] = internetGateway;
    actionOutputs[accessSG.resourceId] = accessSG;
    return actionOutputs;
  }
}

@Factory<AddRegionModelAction>(AddRegionModelAction)
export class AddRegionModelActionFactory {
  private static instance: AddRegionModelAction;

  static async create(): Promise<AddRegionModelAction> {
    if (!this.instance) {
      this.instance = new AddRegionModelAction();
    }
    return this.instance;
  }
}
