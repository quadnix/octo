import {
  AResource,
  DependencyRelationship,
  Diff,
  DiffAction,
  type MatchingResource,
  Resource,
  ResourceError,
} from '@quadnix/octo';
import type { InternetGatewaySchema } from '../internet-gateway/index.schema.js';
import type { NatGatewaySchema } from '../nat-gateway/index.schema.js';
import type { SubnetSchema } from '../subnet/index.schema.js';
import type { VpcSchema } from '../vpc/index.schema.js';
import { RouteTableSchema } from './index.schema.js';

@Resource<RouteTable>('@octo', 'route-table', RouteTableSchema)
export class RouteTable extends AResource<RouteTableSchema, RouteTable> {
  declare parents: [
    MatchingResource<VpcSchema>,
    MatchingResource<InternetGatewaySchema>,
    MatchingResource<SubnetSchema>,
    ...MatchingResource<NatGatewaySchema>[],
  ];
  declare properties: RouteTableSchema['properties'];
  declare response: RouteTableSchema['response'];

  constructor(
    resourceId: string,
    properties: RouteTableSchema['properties'],
    parents: [
      MatchingResource<VpcSchema>,
      MatchingResource<InternetGatewaySchema>,
      MatchingResource<SubnetSchema>,
      ...MatchingResource<NatGatewaySchema>[],
    ],
  ) {
    super(resourceId, properties, parents);

    const natGatewayMatchingParents = parents.filter(
      (p) => (p.getActual().constructor as typeof AResource).NODE_NAME === 'nat-gateway',
    );
    if (natGatewayMatchingParents.length > 1) {
      throw new ResourceError('Only one NAT Gateway is allowed per Route Table!', this);
    }

    if (natGatewayMatchingParents.length === 1) {
      this.updateNatGatewayResourceDependencyBehaviors(
        natGatewayMatchingParents[0].getActual() as AResource<NatGatewaySchema, any>,
      );
    }
  }

  addRouteToNatGateway(natGateway: MatchingResource<NatGatewaySchema>): void {
    const existingNatGatewayParentDependencies = this.getParents('nat-gateway')['nat-gateway'];
    if (existingNatGatewayParentDependencies?.length > 0) {
      throw new ResourceError('A NAT Gateway is already associated with this route-table', this);
    }

    const { childToParentDependency, parentToChildDependency } = natGateway.addChild('resourceId', this, 'resourceId');
    childToParentDependency.addBehavior('parent', DiffAction.ADD, 'resourceId', DiffAction.ADD);
    childToParentDependency.addBehavior('parent', DiffAction.ADD, 'resourceId', DiffAction.UPDATE);
    childToParentDependency.addBehavior('parent', DiffAction.DELETE, 'resourceId', DiffAction.ADD);
    childToParentDependency.addBehavior('parent', DiffAction.DELETE, 'resourceId', DiffAction.UPDATE);
    childToParentDependency.addBehavior('parent', DiffAction.UPDATE, 'resourceId', DiffAction.ADD);
    childToParentDependency.addBehavior('parent', DiffAction.UPDATE, 'resourceId', DiffAction.UPDATE);
    parentToChildDependency.addBehavior('resourceId', DiffAction.DELETE, 'parent', DiffAction.DELETE);
    parentToChildDependency.addBehavior('resourceId', DiffAction.DELETE, 'parent', DiffAction.UPDATE);
  }

  override diffUnpack(diff: Diff): Diff[] {
    if (diff.action === DiffAction.ADD && diff.field === 'resourceId') {
      const diffs: Diff[] = [diff];

      const existingNatGatewayParentDependencies = this.getParents('nat-gateway')['nat-gateway'];
      if (existingNatGatewayParentDependencies?.length > 0) {
        diffs.push(new Diff(this, DiffAction.ADD, 'parent', existingNatGatewayParentDependencies[0].to));
      }

      return diffs;
    } else {
      return [diff];
    }
  }

  private updateNatGatewayResourceDependencyBehaviors(natGatewayParent: AResource<NatGatewaySchema, any>): void {
    const routeTableToNatGatewayDep = this.getDependency(natGatewayParent, DependencyRelationship.CHILD)!;
    const natGatewayToRouteTableDep = natGatewayParent.getDependency(this, DependencyRelationship.PARENT)!;

    // Before updating route-table must handle nat-gateway.
    routeTableToNatGatewayDep.addBehavior('parent', DiffAction.ADD, 'resourceId', DiffAction.ADD);
    routeTableToNatGatewayDep.addBehavior('parent', DiffAction.ADD, 'resourceId', DiffAction.UPDATE);
    routeTableToNatGatewayDep.addBehavior('parent', DiffAction.DELETE, 'resourceId', DiffAction.ADD);
    routeTableToNatGatewayDep.addBehavior('parent', DiffAction.DELETE, 'resourceId', DiffAction.UPDATE);
    routeTableToNatGatewayDep.addBehavior('parent', DiffAction.UPDATE, 'resourceId', DiffAction.ADD);
    routeTableToNatGatewayDep.addBehavior('parent', DiffAction.UPDATE, 'resourceId', DiffAction.UPDATE);

    // Before deleting nat-gateway must handle route-table.
    natGatewayToRouteTableDep.addBehavior('resourceId', DiffAction.DELETE, 'parent', DiffAction.DELETE);
    natGatewayToRouteTableDep.addBehavior('resourceId', DiffAction.DELETE, 'parent', DiffAction.UPDATE);
  }
}
