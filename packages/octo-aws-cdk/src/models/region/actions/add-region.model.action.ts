import {
  Action,
  ActionInputs,
  ActionOutputs,
  Diff,
  DiffAction,
  EnableHook,
  Factory,
  IModelAction,
  ModelType,
} from '@quadnix/octo';
import { InternetGateway } from '../../../resources/internet-gateway/internet-gateway.resource.js';
import { NetworkAcl } from '../../../resources/network-acl/network-acl.resource.js';
import { RouteTable } from '../../../resources/route-table/route-table.resource.js';
import { SecurityGroup } from '../../../resources/security-group/security-group.resource.js';
import { Subnet } from '../../../resources/subnet/subnet.resource.js';
import { Vpc } from '../../../resources/vpc/vpc.resource.js';
import { AwsRegion } from '../aws.region.model.js';

@Action(ModelType.MODEL)
export class AddRegionModelAction implements IModelAction {
  readonly ACTION_NAME: string = 'AddRegionModelAction';

  collectInput(diff: Diff): string[] {
    const awsRegion = diff.model as AwsRegion;
    const regionId = awsRegion.regionId;

    return [
      `input.region.${regionId}.subnet.private1.CidrBlock`,
      `input.region.${regionId}.subnet.public1.CidrBlock`,
      `input.region.${regionId}.vpc.CidrBlock`,
    ];
  }

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'region' && diff.field === 'regionId';
  }

  @EnableHook('PostModelActionHook')
  async handle(diff: Diff, actionInputs: ActionInputs): Promise<ActionOutputs> {
    const awsRegion = diff.model as AwsRegion;
    const regionId = awsRegion.regionId;

    const private1SubnetCidrBlock = actionInputs[`input.region.${regionId}.subnet.private1.CidrBlock`] as string;
    const public1SubnetCidrBlock = actionInputs[`input.region.${regionId}.subnet.public1.CidrBlock`] as string;
    const vpcCidrBlock = actionInputs[`input.region.${regionId}.vpc.CidrBlock`] as string;

    // Create VPC.
    const vpc = new Vpc(`vpc-${regionId}`, {
      awsRegionId: awsRegion.awsRegionId,
      CidrBlock: vpcCidrBlock,
      InstanceTenancy: 'default',
    });

    // Create Internet Gateway.
    const internetGateway = new InternetGateway(`igw-${regionId}`, { awsRegionId: awsRegion.awsRegionId }, [vpc]);

    // Create Subnets.
    const privateSubnet1 = new Subnet(
      `subnet-${regionId}-private-1`,
      {
        AvailabilityZone: awsRegion.awsRegionAZ,
        awsRegionId: awsRegion.awsRegionId,
        CidrBlock: private1SubnetCidrBlock,
      },
      [vpc],
    );
    const publicSubnet1 = new Subnet(
      `subnet-${regionId}-public-1`,
      {
        AvailabilityZone: awsRegion.awsRegionAZ,
        awsRegionId: awsRegion.awsRegionId,
        CidrBlock: public1SubnetCidrBlock,
      },
      [vpc],
    );

    // Create Route Tables.
    const privateRT1 = new RouteTable(`rt-${regionId}-private-1`, { awsRegionId: awsRegion.awsRegionId }, [
      vpc,
      internetGateway,
      privateSubnet1,
    ]);
    const publicRT1 = new RouteTable(`rt-${regionId}-public-1`, { awsRegionId: awsRegion.awsRegionId }, [
      vpc,
      internetGateway,
      publicSubnet1,
    ]);

    // Create Network ACLs.
    const privateNAcl1 = new NetworkAcl(
      `nacl-${regionId}-private-1`,
      {
        awsRegionId: awsRegion.awsRegionId,
        entries: [
          {
            CidrBlock: '0.0.0.0/0',
            Egress: true,
            PortRange: { From: -1, To: -1 },
            Protocol: '-1', // All.
            RuleAction: 'allow',
            RuleNumber: 10,
          },
          {
            CidrBlock: '0.0.0.0/0',
            Egress: false,
            PortRange: { From: -1, To: -1 },
            Protocol: '-1', // All.
            RuleAction: 'allow',
            RuleNumber: 10,
          },
        ],
      },
      [vpc, privateSubnet1],
    );
    const publicNAcl1 = new NetworkAcl(
      `nacl-${regionId}-public-1`,
      {
        awsRegionId: awsRegion.awsRegionId,
        entries: [
          {
            CidrBlock: '0.0.0.0/0',
            Egress: true,
            PortRange: { From: -1, To: -1 },
            Protocol: '-1', // All.
            RuleAction: 'allow',
            RuleNumber: 10,
          },
          {
            CidrBlock: '0.0.0.0/0',
            Egress: false,
            PortRange: { From: -1, To: -1 },
            Protocol: '-1', // All.
            RuleAction: 'allow',
            RuleNumber: 10,
          },
        ],
      },
      [vpc, publicSubnet1],
    );

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
    const internalOpenSG = new SecurityGroup(
      `sec-grp-${regionId}-internal-open`,
      {
        awsRegionId: awsRegion.awsRegionId,
        rules: [
          // Allow all incoming connections from the same VPC.
          {
            CidrBlock: vpcCidrBlock,
            Egress: false,
            FromPort: -1,
            IpProtocol: '-1',
            ToPort: -1,
          },
        ],
      },
      [vpc],
    );
    const privateClosedSG = new SecurityGroup(
      `sec-grp-${regionId}-private-closed`,
      {
        awsRegionId: awsRegion.awsRegionId,
        rules: [
          // Allow all incoming connections from self.
          {
            CidrBlock: private1SubnetCidrBlock,
            Egress: false,
            FromPort: -1,
            IpProtocol: '-1',
            ToPort: -1,
          },
          // Allow all incoming connections from the public subnet.
          {
            CidrBlock: public1SubnetCidrBlock,
            Egress: false,
            FromPort: -1,
            IpProtocol: '-1',
            ToPort: -1,
          },
        ],
      },
      [vpc],
    );
    const webSG = new SecurityGroup(
      `sec-grp-${regionId}-web`,
      {
        awsRegionId: awsRegion.awsRegionId,
        rules: [
          // Access HTTP from everywhere.
          {
            CidrBlock: '0.0.0.0/0',
            Egress: false,
            FromPort: 80,
            IpProtocol: 'tcp',
            ToPort: 80,
          },
          // Access HTTPS from everywhere.
          {
            CidrBlock: '0.0.0.0/0',
            Egress: false,
            FromPort: 443,
            IpProtocol: 'tcp',
            ToPort: 443,
          },
        ],
      },
      [vpc],
    );

    const output: ActionOutputs = {};
    output[vpc.resourceId] = vpc;
    output[internetGateway.resourceId] = internetGateway;
    output[privateSubnet1.resourceId] = privateSubnet1;
    output[publicSubnet1.resourceId] = publicSubnet1;
    output[privateRT1.resourceId] = privateRT1;
    output[publicRT1.resourceId] = publicRT1;
    output[privateNAcl1.resourceId] = privateNAcl1;
    output[publicNAcl1.resourceId] = publicNAcl1;
    output[accessSG.resourceId] = accessSG;
    output[internalOpenSG.resourceId] = internalOpenSG;
    output[privateClosedSG.resourceId] = privateClosedSG;
    output[webSG.resourceId] = webSG;

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
