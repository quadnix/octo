import {
  AssociateRouteTableCommand,
  AttachInternetGatewayCommand,
  AuthorizeSecurityGroupEgressCommand,
  AuthorizeSecurityGroupIngressCommand,
  CreateInternetGatewayCommand,
  CreateNetworkAclCommand,
  CreateNetworkAclEntryCommand,
  CreateRouteCommand,
  CreateRouteTableCommand,
  CreateSecurityGroupCommand,
  CreateSubnetCommand,
  CreateVpcCommand,
  DescribeNetworkAclsCommand,
  EC2Client,
  ReplaceNetworkAclAssociationCommand,
} from '@aws-sdk/client-ec2';
import { Diff, DiffAction, IAction, IActionInputRequest, IActionInputResponse } from '@quadnix/octo';
import { AwsRegion } from '../aws.region.model';

export class AddRegionAction implements IAction {
  readonly ACTION_NAME: string = 'addRegionAction';

  constructor(private readonly ec2Client: EC2Client, private readonly awsRegion: AwsRegion) {}

  collectInput(diff: Diff): IActionInputRequest {
    const awsRegion = diff.model as AwsRegion;
    return [
      `region.${awsRegion.nativeAwsRegionAZ}.subnet.private.CidrBlock`,
      `region.${awsRegion.nativeAwsRegionAZ}.subnet.public.CidrBlock`,
      'region.vpc.CidrBlock',
    ];
  }

  filter(diff: Diff): boolean {
    return diff.action === DiffAction.ADD && diff.model.MODEL_NAME === 'region' && diff.field === 'regionId';
  }

  async handle(diff: Diff, actionInput: IActionInputResponse): Promise<void> {
    const awsRegion = diff.model as AwsRegion;

    const privateSubnetCidrBlock = actionInput[`region.${awsRegion.nativeAwsRegionAZ}.subnet.private.CidrBlock`];
    const publicSubnetCidrBlock = actionInput[`region.${awsRegion.nativeAwsRegionAZ}.subnet.public.CidrBlock`];
    const vpcCidrBlock = actionInput['region.vpc.CidrBlock'];

    // Create VPC.
    const vpcOutput = await this.ec2Client.send(
      new CreateVpcCommand({
        CidrBlock: vpcCidrBlock,
        InstanceTenancy: 'default',
      }),
    );

    // Create IGW.
    const internetGWOutput = await this.ec2Client.send(new CreateInternetGatewayCommand({}));
    await this.ec2Client.send(
      new AttachInternetGatewayCommand({
        InternetGatewayId: internetGWOutput!.InternetGateway!.InternetGatewayId,
        VpcId: vpcOutput!.Vpc!.VpcId,
      }),
    );

    // Create RouteTables (private + public).
    const [privateRTOutput, publicRTOutput] = await Promise.all(
      ['private', 'public'].map(() => {
        return this.ec2Client.send(
          new CreateRouteTableCommand({
            VpcId: vpcOutput!.Vpc!.VpcId,
          }),
        );
      }),
    );

    // Create Subnets (private + public).
    const [privateSubnetOutput, publicSubnetOutput] = await Promise.all(
      [privateSubnetCidrBlock, publicSubnetCidrBlock].map((CidrBlock) => {
        return this.ec2Client.send(
          new CreateSubnetCommand({
            AvailabilityZone: this.awsRegion.nativeAwsRegionAZ,
            CidrBlock,
            VpcId: vpcOutput!.Vpc!.VpcId,
          }),
        );
      }),
    );

    // Associate RouteTables to Subnets and IGW.
    await Promise.all(
      [
        { routeTableOutput: privateRTOutput, subnetOutput: privateSubnetOutput },
        { routeTableOutput: publicRTOutput, subnetOutput: publicSubnetOutput },
      ].map((resources) => {
        return Promise.all([
          this.ec2Client.send(
            new AssociateRouteTableCommand({
              RouteTableId: resources.routeTableOutput!.RouteTable!.RouteTableId,
              SubnetId: resources.subnetOutput!.Subnet!.SubnetId,
            }),
          ),
          this.ec2Client.send(
            new CreateRouteCommand({
              DestinationCidrBlock: '0.0.0.0/0',
              GatewayId: internetGWOutput!.InternetGateway!.InternetGatewayId,
              RouteTableId: resources.routeTableOutput!.RouteTable!.RouteTableId,
            }),
          ),
        ]);
      }),
    );

    const defaultNACLOutput = await this.ec2Client.send(
      new DescribeNetworkAclsCommand({
        Filters: [
          {
            Name: 'association.subnet-id',
            Values: [privateSubnetOutput!.Subnet!.SubnetId, publicSubnetOutput!.Subnet!.SubnetId] as string[],
          },
        ],
      }),
    );

    // Create NACLs (private + public).
    await Promise.all(
      [privateSubnetOutput, publicSubnetOutput].map(async (subnetOutput) => {
        const naclOutput = await this.ec2Client.send(
          new CreateNetworkAclCommand({
            VpcId: vpcOutput!.Vpc!.VpcId,
          }),
        );

        await Promise.all(
          [true, false].map((isEgress) => {
            return this.ec2Client.send(
              new CreateNetworkAclEntryCommand({
                CidrBlock: '0.0.0.0/0',
                Egress: isEgress,
                NetworkAclId: naclOutput!.NetworkAcl!.NetworkAclId,
                PortRange: { From: -1, To: -1 },
                Protocol: '-1', // All.
                RuleAction: 'allow',
                RuleNumber: 10,
              }),
            );
          }),
        );

        const association = defaultNACLOutput!.NetworkAcls![0].Associations!.find(
          (a) => a.SubnetId === subnetOutput!.Subnet!.SubnetId,
        );
        await this.ec2Client.send(
          new ReplaceNetworkAclAssociationCommand({
            AssociationId: association!.NetworkAclAssociationId,
            NetworkAclId: naclOutput!.NetworkAcl!.NetworkAclId,
          }),
        );

        return naclOutput;
      }),
    );

    // Create Security Groups.
    const [accessSGOutput, internalOpenSGOutput, privateClosedSGOutput, webSGOutput] = await Promise.all(
      ['AccessSG', 'InternalOpenSecurityGroup', 'PrivateClosedSecurityGroup', 'WebSG'].map((name) => {
        return this.ec2Client.send(
          new CreateSecurityGroupCommand({
            Description: name,
            GroupName: name,
            VpcId: vpcOutput!.Vpc!.VpcId,
          }),
        );
      }),
    );

    await Promise.all(
      [
        {
          groupId: accessSGOutput.GroupId,
          isEgress: false,
          rules: [
            { from: 22, protocol: 'tcp', range: '0.0.0.0/0', to: 22 }, // Access SSH from everywhere.
            { from: 8500, protocol: 'tcp', range: '0.0.0.0/0', to: 8500 }, // Access Consul UI from everywhere.
          ],
        },
        {
          groupId: internalOpenSGOutput.GroupId,
          isEgress: false,
          rules: [{ from: -1, protocol: '-1', range: vpcCidrBlock, to: -1 }], // Allow all incoming connections from the same VPC.
        },
        {
          groupId: privateClosedSGOutput.GroupId,
          isEgress: false,
          rules: [
            { from: -1, protocol: '-1', range: publicSubnetCidrBlock, to: -1 }, // Allow all incoming connections from the public subnet.
            { from: -1, protocol: '-1', range: privateSubnetCidrBlock, to: -1 }, // Allow all incoming connections from self.
          ],
        },
        {
          groupId: webSGOutput.GroupId,
          isEgress: false,
          rules: [
            { from: 80, protocol: 'tcp', range: '0.0.0.0/0', to: 80 }, // Access HTTP from everywhere.
            { from: 443, protocol: 'tcp', range: '0.0.0.0/0', to: 443 }, // Access HTTPS from everywhere.
          ],
        },
      ].map((sgDetails) => {
        const payload = sgDetails.rules.map((rule) => ({
          FromPort: rule.from,
          IpProtocol: rule.protocol,
          IpRanges: [
            {
              CidrIp: rule.range,
            },
          ],
          ToPort: rule.to,
        }));

        if (sgDetails.isEgress) {
          return this.ec2Client.send(
            new AuthorizeSecurityGroupEgressCommand({ GroupId: sgDetails.groupId, IpPermissions: payload }),
          );
        } else {
          return this.ec2Client.send(
            new AuthorizeSecurityGroupIngressCommand({ GroupId: sgDetails.groupId, IpPermissions: payload }),
          );
        }
      }),
    );
  }

  async revert(): Promise<void> {
    throw new Error('Method not implemented!');
  }
}
