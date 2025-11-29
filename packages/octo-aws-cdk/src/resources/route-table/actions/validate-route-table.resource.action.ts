import { DescribeRouteTablesCommand, EC2Client } from '@aws-sdk/client-ec2';
import {
  ANodeAction,
  Action,
  type Diff,
  DiffAction,
  Factory,
  type IResourceAction,
  type MatchingResource,
  TransactionError,
  hasNodeName,
} from '@quadnix/octo';
import { EC2ClientFactory } from '../../../factories/aws-client.factory.js';
import type { NatGatewaySchema } from '../../nat-gateway/index.schema.js';
import { RouteTable } from '../route-table.resource.js';

/**
 * @internal
 */
@Action(RouteTable)
export class ValidateRouteTableResourceAction extends ANodeAction implements IResourceAction<RouteTable> {
  constructor() {
    super();
  }

  filter(diff: Diff): boolean {
    return (
      diff.action === DiffAction.VALIDATE &&
      diff.node instanceof RouteTable &&
      hasNodeName(diff.node, 'route-table') &&
      diff.field === 'resourceId'
    );
  }

  async handle(diff: Diff<RouteTable>): Promise<void> {
    // Get properties.
    const routeTable = diff.node;
    const properties = routeTable.properties;
    const response = routeTable.response;
    const routeTableVpc = routeTable.parents[0];
    const routeTableInternetGateway = routeTable.parents[1];
    const routeTableSubnet = routeTable.parents[2];
    const routeTableNatGateway = routeTable.parents.find((p) => hasNodeName(p.getActual(), 'nat-gateway')) as
      | MatchingResource<NatGatewaySchema>
      | undefined;

    // Get instances.
    const ec2Client = await this.container.get<EC2Client, typeof EC2ClientFactory>(EC2Client, {
      args: [properties.awsAccountId, properties.awsRegionId],
      metadata: { package: '@octo' },
    });

    // Check if Route Table exists.
    const describeRouteTablesResult = await ec2Client.send(
      new DescribeRouteTablesCommand({
        RouteTableIds: [response.RouteTableId!],
      }),
    );
    if (!describeRouteTablesResult.RouteTables || describeRouteTablesResult.RouteTables.length === 0) {
      throw new TransactionError(`Route Table with ID ${response.RouteTableId} does not exist!`);
    }

    // Validate Route Table VPC (parent).
    const actualRouteTable = describeRouteTablesResult.RouteTables[0];
    const expectedVpcId = routeTableVpc.getSchemaInstanceInResourceAction().response.VpcId;
    if (actualRouteTable.VpcId !== expectedVpcId) {
      throw new TransactionError(
        `Route Table VPC mismatch. Expected: ${expectedVpcId}, Actual: ${actualRouteTable.VpcId || 'undefined'}`,
      );
    }

    // Validate Route Table owner (AWS account).
    if (actualRouteTable.OwnerId !== properties.awsAccountId) {
      throw new TransactionError(
        `Route Table account ID mismatch. Expected: ${properties.awsAccountId}, Actual: ${actualRouteTable.OwnerId || 'undefined'}`,
      );
    }

    // Validate Route Table ARN format (region should match).
    const expectedArnPrefix = `arn:aws:ec2:${properties.awsRegionId}:${properties.awsAccountId}:route-table/`;
    if (!response.RouteTableArn!.startsWith(expectedArnPrefix)) {
      throw new TransactionError(
        `Route Table ARN region/account mismatch. Expected prefix: ${expectedArnPrefix}, Actual: ${response.RouteTableArn}`,
      );
    }

    // Validate subnet association.
    const expectedSubnetId = routeTableSubnet.getSchemaInstanceInResourceAction().response.SubnetId;
    const subnetAssociation = actualRouteTable.Associations?.find((assoc) => assoc.SubnetId === expectedSubnetId);

    if (!subnetAssociation) {
      throw new TransactionError(
        `Route Table is not associated with subnet ${expectedSubnetId}. Current associations: ${JSON.stringify(actualRouteTable.Associations?.map((a) => a.SubnetId))}`,
      );
    }

    if (subnetAssociation.RouteTableAssociationId !== response.subnetAssociationId) {
      throw new TransactionError(
        `Route Table subnet association ID mismatch. Expected: ${response.subnetAssociationId}, Actual: ${subnetAssociation.RouteTableAssociationId || 'undefined'}`,
      );
    }

    // Validate routes.
    const routes = actualRouteTable.Routes || [];

    // Validate Internet Gateway route if configured.
    if (properties.associateWithInternetGateway) {
      const expectedIgwId = routeTableInternetGateway.getSchemaInstanceInResourceAction().response.InternetGatewayId;
      const igwRoute = routes.find(
        (route) => route.GatewayId === expectedIgwId && route.DestinationCidrBlock === '0.0.0.0/0',
      );

      if (!igwRoute) {
        throw new TransactionError(
          `Route Table missing Internet Gateway route to 0.0.0.0/0 via ${expectedIgwId}. Current routes: ${JSON.stringify(routes.map((r) => ({ destination: r.DestinationCidrBlock, gateway: r.GatewayId })))}`,
        );
      }

      if (igwRoute.State !== 'active') {
        throw new TransactionError(`Internet Gateway route state is not active. State: ${igwRoute.State}`);
      }
    }

    // Validate NAT Gateway route if configured.
    if (routeTableNatGateway) {
      const expectedNatGwId = routeTableNatGateway.getSchemaInstanceInResourceAction().response.NatGatewayId;
      const natGwRoute = routes.find(
        (route) => route.NatGatewayId === expectedNatGwId && route.DestinationCidrBlock === '0.0.0.0/0',
      );

      if (!natGwRoute) {
        throw new TransactionError(
          `Route Table missing NAT Gateway route to 0.0.0.0/0 via ${expectedNatGwId}. Current routes: ${JSON.stringify(routes.map((r) => ({ destination: r.DestinationCidrBlock, natGateway: r.NatGatewayId })))}`,
        );
      }

      if (natGwRoute.State !== 'active') {
        throw new TransactionError(`NAT Gateway route state is not active. State: ${natGwRoute.State}`);
      }
    }

    // Validate no conflicting routes to 0.0.0.0/0.
    const defaultRoutes = routes.filter((route) => route.DestinationCidrBlock === '0.0.0.0/0');
    const expectedDefaultRouteCount =
      (properties.associateWithInternetGateway ? 1 : 0) + (routeTableNatGateway ? 1 : 0);

    if (defaultRoutes.length !== expectedDefaultRouteCount) {
      throw new TransactionError(
        `Route Table has unexpected number of default routes (0.0.0.0/0). Expected: ${expectedDefaultRouteCount}, Actual: ${defaultRoutes.length}`,
      );
    }
  }
}

/**
 * @internal
 */
@Factory<ValidateRouteTableResourceAction>(ValidateRouteTableResourceAction)
export class ValidateRouteTableResourceActionFactory {
  private static instance: ValidateRouteTableResourceAction;

  static async create(): Promise<ValidateRouteTableResourceAction> {
    if (!this.instance) {
      this.instance = new ValidateRouteTableResourceAction();
    }
    return this.instance;
  }
}
