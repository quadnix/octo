import { Diff, DiffAction, IActionInputs, IActionOutputs } from '@quadnix/octo';
import { Efs } from '../../../resources/efs/efs.resource';
import { SharedEfs } from '../../../resources/efs/efs.shared-resource';
import { InternetGateway } from '../../../resources/internet-gateway/internet-gateway.resource';
import { NetworkAcl } from '../../../resources/network-acl/network-acl.resource';
import { RouteTable } from '../../../resources/route-table/route-table.resource';
import { SecurityGroup } from '../../../resources/security-groups/security-group.resource';
import { Subnet } from '../../../resources/subnet/subnet.resource';
import { Vpc } from '../../../resources/vpc/vpc.resource';
import { Action } from '../../action.abstract';
import { AwsRegion } from '../aws.region.model';

export class AddRegionAction extends Action {
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

  override collectOutput(diff: Diff): string[] {
    const { regionId } = diff.model as AwsRegion;

    return [
      `${regionId}-vpc`,
      `${regionId}-igw`,
      `${regionId}-private-subnet-1`,
      `${regionId}-public-subnet-1`,
      `${regionId}-private-rt-1`,
      `${regionId}-public-rt-1`,
      `${regionId}-private-nacl-1`,
      `${regionId}-public-nacl-1`,
      `${regionId}-access-sg`,
      `${regionId}-internal-open-sg`,
      `${regionId}-private-closed-sg`,
      `${regionId}-web-sg`,
      `${regionId}-shared-efs-filesystem`,
    ];
  }

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'region' && diff.field === 'regionId';
  }

  handle(diff: Diff, actionInputs: IActionInputs): IActionOutputs {
    const awsRegion = diff.model as AwsRegion;
    const regionId = awsRegion.regionId;

    const private1SubnetCidrBlock = actionInputs[`input.region.${regionId}.subnet.private1.CidrBlock`] as string;
    const public1SubnetCidrBlock = actionInputs[`input.region.${regionId}.subnet.public1.CidrBlock`] as string;
    const vpcCidrBlock = actionInputs[`input.region.${regionId}.vpc.CidrBlock`] as string;

    // Create VPC.
    const vpc = new Vpc(`${regionId}-vpc`, {
      CidrBlock: vpcCidrBlock,
      InstanceTenancy: 'default',
    });

    // Create Internet Gateway.
    const internetGateway = new InternetGateway(`${regionId}-igw`, {}, [vpc]);

    // Create Subnets.
    const privateSubnet1 = new Subnet(
      `${regionId}-private-subnet-1`,
      {
        AvailabilityZone: awsRegion.nativeAwsRegionAZ,
        CidrBlock: private1SubnetCidrBlock,
      },
      [vpc],
    );
    const publicSubnet1 = new Subnet(
      `${regionId}-public-subnet-1`,
      {
        AvailabilityZone: awsRegion.nativeAwsRegionAZ,
        CidrBlock: public1SubnetCidrBlock,
      },
      [vpc],
    );

    // Create Route Tables.
    const privateRT1 = new RouteTable(`${regionId}-private-rt-1`, {}, [vpc, internetGateway, privateSubnet1]);
    const publicRT1 = new RouteTable(`${regionId}-public-rt-1`, {}, [vpc, internetGateway, publicSubnet1]);

    // Create Network ACLs.
    const privateNAcl1 = new NetworkAcl(
      `${regionId}-private-nacl-1`,
      {
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
    const efs = new Efs(`${regionId}-shared-efs-filesystem`, {}, [privateSubnet1, internalOpenSG]);
    const sharedEfs = new SharedEfs(efs);
    sharedEfs.markUpdated('regions', `ADD:${regionId}`);

    const output: IActionOutputs = {};
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
    output[efs.resourceId] = sharedEfs;

    return output;
  }
}
