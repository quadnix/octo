import { Action, ActionInputs, ActionOutputs, Diff, DiffAction, Factory, ModelType } from '@quadnix/octo';
import { Efs } from '../../../resources/efs/efs.resource.js';
import { SharedEfs } from '../../../resources/efs/efs.shared-resource.js';
import { InternetGateway } from '../../../resources/internet-gateway/internet-gateway.resource.js';
import { NetworkAcl } from '../../../resources/network-acl/network-acl.resource.js';
import { RouteTable } from '../../../resources/route-table/route-table.resource.js';
import { SecurityGroup } from '../../../resources/security-groups/security-group.resource.js';
import { Subnet } from '../../../resources/subnet/subnet.resource.js';
import { Vpc } from '../../../resources/vpc/vpc.resource.js';
import { AAction } from '../../action.abstract.js';
import { AwsRegion } from '../aws.region.model.js';

@Action(ModelType.MODEL)
export class AddRegionAction extends AAction {
  readonly ACTION_NAME: string = 'AddRegionAction';

  override collectInput(diff: Diff): string[] {
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

  async handle(diff: Diff, actionInputs: ActionInputs): Promise<ActionOutputs> {
    const awsRegion = diff.model as AwsRegion;
    const regionId = awsRegion.regionId;

    const private1SubnetCidrBlock = actionInputs[`input.region.${regionId}.subnet.private1.CidrBlock`] as string;
    const public1SubnetCidrBlock = actionInputs[`input.region.${regionId}.subnet.public1.CidrBlock`] as string;
    const vpcCidrBlock = actionInputs[`input.region.${regionId}.vpc.CidrBlock`] as string;

    // Create VPC.
    const vpc = new Vpc(`${regionId}-vpc`, {
      awsRegionId: awsRegion.awsRegionId,
      CidrBlock: vpcCidrBlock,
      InstanceTenancy: 'default',
    });

    // Create Internet Gateway.
    const internetGateway = new InternetGateway(`${regionId}-igw`, { awsRegionId: awsRegion.awsRegionId }, [vpc]);

    // Create Subnets.
    const privateSubnet1 = new Subnet(
      `${regionId}-private-subnet-1`,
      {
        AvailabilityZone: awsRegion.awsRegionAZ,
        awsRegionId: awsRegion.awsRegionId,
        CidrBlock: private1SubnetCidrBlock,
      },
      [vpc],
    );
    const publicSubnet1 = new Subnet(
      `${regionId}-public-subnet-1`,
      {
        AvailabilityZone: awsRegion.awsRegionAZ,
        awsRegionId: awsRegion.awsRegionId,
        CidrBlock: public1SubnetCidrBlock,
      },
      [vpc],
    );

    // Create Route Tables.
    const privateRT1 = new RouteTable(`${regionId}-private-rt-1`, { awsRegionId: awsRegion.awsRegionId }, [
      vpc,
      internetGateway,
      privateSubnet1,
    ]);
    const publicRT1 = new RouteTable(`${regionId}-public-rt-1`, { awsRegionId: awsRegion.awsRegionId }, [
      vpc,
      internetGateway,
      publicSubnet1,
    ]);

    // Create Network ACLs.
    const privateNAcl1 = new NetworkAcl(
      `${regionId}-private-nacl-1`,
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
      `${regionId}-public-nacl-1`,
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
      `${regionId}-access-sg`,
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
      `${regionId}-internal-open-sg`,
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
      `${regionId}-private-closed-sg`,
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
      `${regionId}-web-sg`,
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

    // Create EFS.
    const efs = new Efs(
      `${regionId}-efs-filesystem`,
      { awsRegionId: awsRegion.awsRegionId, regionId: awsRegion.regionId },
      [privateSubnet1, internalOpenSG],
    );
    const sharedEfs = new SharedEfs('shared-efs-filesystem', {}, [efs]);

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
    output[efs.resourceId] = efs;
    output[sharedEfs.resourceId] = sharedEfs;

    return output;
  }
}

@Factory<AddRegionAction>(AddRegionAction)
export class AddRegionActionFactory {
  static async create(): Promise<AddRegionAction> {
    return new AddRegionAction();
  }
}
