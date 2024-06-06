import {
  Action,
  type ActionInputs,
  type ActionOutputs,
  Diff,
  DiffAction,
  EnableHook,
  Factory,
  type IModelAction,
  ModelType,
} from '@quadnix/octo';
import { InternetGateway } from '../../../resources/internet-gateway/internet-gateway.resource.js';
import { SecurityGroup } from '../../../resources/security-group/security-group.resource.js';
import { Vpc } from '../../../resources/vpc/vpc.resource.js';
import { AwsRegion } from '../aws.region.model.js';

@Action(ModelType.MODEL)
export class AddRegionModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'AddRegionModelAction';

  collectInput(diff: Diff): string[] {
    const awsRegion = diff.model as AwsRegion;
    const regionId = awsRegion.regionId;

    return [`input.region.${regionId}.vpc.CidrBlock`];
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.ADD &&
      diff.model instanceof AwsRegion &&
      diff.model.MODEL_NAME === 'region' &&
      diff.field === 'regionId'
    );
  }

  @EnableHook('PostModelActionHook')
  async handle(diff: Diff, actionInputs: ActionInputs): Promise<ActionOutputs> {
    const awsRegion = diff.model as AwsRegion;
    const regionId = awsRegion.regionId;

    const vpcCidrBlock = actionInputs[`input.region.${regionId}.vpc.CidrBlock`] as string;

    // Create VPC.
    const vpc = new Vpc(`vpc-${regionId}`, {
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

    const output: ActionOutputs = {};
    output[vpc.resourceId] = vpc;
    output[internetGateway.resourceId] = internetGateway;
    output[accessSG.resourceId] = accessSG;

    return output;
  }

  async revert(): Promise<ActionOutputs> {
    return {};
  }
}

@Factory<AddRegionModelAction>(AddRegionModelAction)
export class AddRegionModelActionFactory {
  static async create(): Promise<AddRegionModelAction> {
    return new AddRegionModelAction();
  }
}
