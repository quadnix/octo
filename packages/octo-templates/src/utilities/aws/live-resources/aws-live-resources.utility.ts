import {
  DescribeInternetGatewaysCommand,
  DescribeNatGatewaysCommand,
  type DescribeNatGatewaysCommandOutput,
  DescribeNetworkAclsCommand,
  DescribeRouteTablesCommand,
  DescribeSecurityGroupsCommand,
  DescribeSubnetsCommand,
  DescribeVpcsCommand,
  EC2Client,
} from '@aws-sdk/client-ec2';
import {
  DescribeClustersCommand,
  DescribeServicesCommand,
  DescribeTaskDefinitionCommand,
  ECSClient,
} from '@aws-sdk/client-ecs';

/**
 * `DescribeServices` accepts at most 10 services per call.
 */
const DESCRIBE_BATCH_SIZE = 10;

/**
 * VPC-family resources stop resolving entirely once destroyed, so the test for all of them is the
 * same: describe by id and see whether AWS still knows about it.
 *
 * Keyed by the infix that identifies the resource type inside an EC2 ARN.
 */
const EC2_DESCRIBE_BY_ID: { build: (id: string) => object; infix: string }[] = [
  { build: (id) => new DescribeInternetGatewaysCommand({ InternetGatewayIds: [id] }), infix: ':internet-gateway/' },
  { build: (id) => new DescribeNetworkAclsCommand({ NetworkAclIds: [id] }), infix: ':network-acl/' },
  { build: (id) => new DescribeRouteTablesCommand({ RouteTableIds: [id] }), infix: ':route-table/' },
  { build: (id) => new DescribeSecurityGroupsCommand({ GroupIds: [id] }), infix: ':security-group/' },
  { build: (id) => new DescribeSubnetsCommand({ SubnetIds: [id] }), infix: ':subnet/' },
  { build: (id) => new DescribeVpcsCommand({ VpcIds: [id] }), infix: ':vpc/' },
];

/**
 * Decides which of a set of ARNs point at infrastructure that is still live.
 *
 * The Resource Groups Tagging API keeps returning resources, still tagged, long after they are
 * destroyed:
 * - ECS clusters and services become INACTIVE tombstones that AWS ages out on its own, and cannot be
 *   deleted a second time;
 * - ECS task definition revisions become INACTIVE when destroyed, and an explicit delete only moves
 *   them to DELETE_IN_PROGRESS, where they can sit for a long time;
 * - EC2 NAT gateways stay visible in the `deleted` state after their delete completes;
 * - EC2 VPC-family resources are gone, but the tagging API keeps listing them for a while, including
 *   subnets `DescribeSubnets` already answers `InvalidSubnetID.NotFound` for.
 *
 * A teardown asserting "nothing tagged remains" is therefore flaky; this makes "nothing live remains"
 * decidable instead.
 */
export class AwsLiveResourcesUtility {
  private readonly ec2Client: EC2Client;
  private readonly ecsClient: ECSClient;

  /**
   * @param region The AWS region to read, e.g. `us-east-1`.
   * @param endpoint Address of an AWS-compatible service, e.g. a localstack container. Defaults to AWS.
   */
  constructor(region: string, endpoint?: string) {
    this.ec2Client = new EC2Client({ endpoint, region });
    this.ecsClient = new ECSClient({ endpoint, region });
  }

  /**
   * Returns the subset of `arns` whose resources are still live.
   *
   * ARNs of a kind this utility does not know how to inspect are returned unchanged — an unknown
   * resource is assumed live, so an unhandled leak still fails the teardown rather than hiding.
   */
  async filterLiveArns(arns: string[]): Promise<string[]> {
    const dead = new Set<string>([
      ...(await this.deadEcsClusterArns(arns)),
      ...(await this.deadEcsServiceArns(arns)),
      ...(await this.deadEcsTaskDefinitionArns(arns)),
      ...(await this.deadNatGatewayArns(arns)),
      ...(await this.deadVpcFamilyArns(arns)),
    ]);

    return arns.filter((arn) => !dead.has(arn));
  }

  /**
   * Returns the ARNs of the clusters AWS no longer reports as ACTIVE, including those it has forgotten
   * entirely.
   */
  private async deadEcsClusterArns(arns: string[]): Promise<string[]> {
    const clusterArns = arns.filter((arn) => arn.includes(':cluster/'));
    const dead: string[] = [];

    for (let i = 0; i < clusterArns.length; i += DESCRIBE_BATCH_SIZE) {
      const batch = clusterArns.slice(i, i + DESCRIBE_BATCH_SIZE);
      const response = await this.ecsClient.send(new DescribeClustersCommand({ clusters: batch }));

      for (const cluster of response.clusters ?? []) {
        if (cluster.status !== 'ACTIVE' && cluster.clusterArn) {
          dead.push(cluster.clusterArn);
        }
      }

      // A cluster AWS no longer knows about is reported as a failure, not a cluster.
      for (const failure of response.failures ?? []) {
        if (failure.arn) {
          dead.push(failure.arn);
        }
      }
    }

    return dead;
  }

  /**
   * Returns the ARNs of the services AWS no longer reports as ACTIVE, including those it has forgotten
   * entirely.
   */
  private async deadEcsServiceArns(arns: string[]): Promise<string[]> {
    // A service ARN is `.../service/<cluster>/<service>`, and DescribeServices is per-cluster.
    const serviceArnsByCluster = new Map<string, string[]>();
    for (const arn of arns.filter((a) => a.includes(':service/'))) {
      const [cluster] = arn.split(':service/')[1].split('/');
      serviceArnsByCluster.set(cluster, [...(serviceArnsByCluster.get(cluster) ?? []), arn]);
    }

    const dead: string[] = [];
    for (const [cluster, serviceArns] of serviceArnsByCluster.entries()) {
      for (let i = 0; i < serviceArns.length; i += DESCRIBE_BATCH_SIZE) {
        const batch = serviceArns.slice(i, i + DESCRIBE_BATCH_SIZE);
        const response = await this.ecsClient.send(new DescribeServicesCommand({ cluster, services: batch }));

        for (const service of response.services ?? []) {
          if (service.status !== 'ACTIVE' && service.serviceArn) {
            dead.push(service.serviceArn);
          }
        }

        for (const failure of response.failures ?? []) {
          if (failure.arn) {
            dead.push(failure.arn);
          }
        }
      }
    }

    return dead;
  }

  /**
   * Returns the ARNs of the task definition revisions that are no longer ACTIVE.
   */
  private async deadEcsTaskDefinitionArns(arns: string[]): Promise<string[]> {
    const dead: string[] = [];

    for (const arn of arns.filter((a) => a.includes(':task-definition/'))) {
      try {
        const response = await this.ecsClient.send(new DescribeTaskDefinitionCommand({ taskDefinition: arn }));
        if (response.taskDefinition?.status !== 'ACTIVE') {
          dead.push(arn);
        }
      } catch (error) {
        // Only a client fault proves the revision is gone: ECS refuses to describe one that has been
        // deleted. A server fault, throttling, credentials or a network blip must not be read as
        // "destroyed".
        if (error.name !== 'ClientException' && error.name !== 'InvalidParameterException') {
          throw error;
        }
        dead.push(arn);
      }
    }

    return dead;
  }

  /**
   * Describes each NAT gateway by its own id, for the same reason {@link deadVpcFamilyArns} does: EC2
   * fails the whole describe with `NatGatewayNotFound` if any single id is unknown, so one gateway
   * would decide the answer for all of them.
   *
   * A NAT gateway lingers in the `deleted` state for a while and then stops resolving altogether,
   * while the tagging API goes on listing it for longer still — so a previous run's gateway, aged out
   * between runs, is the id that turns this into a throw.
   */
  private async deadNatGatewayArns(arns: string[]): Promise<string[]> {
    const dead: string[] = [];

    for (const arn of arns.filter((a) => a.includes(':natgateway/'))) {
      const natGatewayId = arn.split(':natgateway/')[1];

      let response: DescribeNatGatewaysCommandOutput;
      try {
        response = await this.ec2Client.send(new DescribeNatGatewaysCommand({ NatGatewayIds: [natGatewayId] }));
      } catch (error) {
        // Only a NotFound proves the gateway is gone. Throttling, credentials or a network blip must
        // not be read as "destroyed".
        if (!/NotFound/.test(`${error.name ?? ''} ${error.message ?? ''}`)) {
          throw error;
        }
        dead.push(arn);
        continue;
      }

      for (const natGateway of response.NatGateways ?? []) {
        if (natGateway.State !== 'available' && natGateway.State !== 'pending') {
          dead.push(arn);
        }
      }
    }

    return dead;
  }

  /**
   * Describes each VPC-family ARN by its own id. One id per call, because EC2 fails the whole describe
   * with `Invalid…ID.NotFound` if any single id is unknown, which would not say which one.
   */
  private async deadVpcFamilyArns(arns: string[]): Promise<string[]> {
    const dead: string[] = [];

    for (const { build, infix } of EC2_DESCRIBE_BY_ID) {
      for (const arn of arns.filter((a) => a.includes(infix))) {
        try {
          await this.ec2Client.send(build(arn.split(infix)[1]) as never);
        } catch (error) {
          // Only a NotFound proves the resource is gone. Throttling, credentials or a network blip
          // must not be read as "destroyed".
          if (!/NotFound/.test(`${error.name ?? ''} ${error.message ?? ''}`)) {
            throw error;
          }
          dead.push(arn);
        }
      }
    }

    return dead;
  }
}
