import { AResource, DependencyRelationship, Diff, DiffAction, type MatchingResource, Resource } from '@quadnix/octo';
import type { EcsClusterSchema } from '../ecs-cluster/index.schema.js';
import type { EcsTaskDefinitionSchema } from '../ecs-task-definition/index.schema.js';
import type { SecurityGroupSchema } from '../security-group/index.schema.js';
import type { SubnetSchema } from '../subnet/index.schema.js';
import { EcsServiceSchema } from './index.schema.js';

@Resource<EcsService>('@octo', 'ecs-service', EcsServiceSchema)
export class EcsService extends AResource<EcsServiceSchema, EcsService> {
  declare parents: [
    MatchingResource<EcsClusterSchema>,
    MatchingResource<EcsTaskDefinitionSchema>,
    MatchingResource<SubnetSchema>,
    ...MatchingResource<SecurityGroupSchema>[],
  ];
  declare properties: EcsServiceSchema['properties'];
  declare response: EcsServiceSchema['response'];

  constructor(
    resourceId: string,
    properties: EcsServiceSchema['properties'],
    parents: [
      MatchingResource<EcsClusterSchema>,
      MatchingResource<EcsTaskDefinitionSchema>,
      MatchingResource<SubnetSchema>,
      ...MatchingResource<SecurityGroupSchema>[],
    ],
  ) {
    super(resourceId, properties, parents);

    this.updateServiceSecurityGroups(parents.slice(3).map((p) => p.getActual() as AResource<SecurityGroupSchema, any>));
    this.updateServiceTaskDefinition(parents[1].getActual() as AResource<EcsTaskDefinitionSchema, any>);
  }

  override async diff(previous: EcsService): Promise<Diff[]> {
    const diffs: Diff[] = await super.diff(previous);

    let shouldConsolidateDiffs = false;
    for (let i = diffs.length - 1; i >= 0; i--) {
      if (diffs[i].field === 'parent' && this.isEcsServiceSecurityGroup(diffs[i].value as AResource<any, any>)) {
        // Consolidate all SecurityGroup parent updates into a single UPDATE diff.
        shouldConsolidateDiffs = true;
        diffs.splice(i, 1);
      } else if (
        diffs[i].field === 'parent' &&
        this.isEcsServiceTaskDefinition(diffs[i].value as AResource<any, any>)
      ) {
        // Translate TaskDefinition parent update into a single UPDATE diff.
        shouldConsolidateDiffs = true;
        diffs.splice(i, 1);
      } else if (diffs[i].field === 'properties' && diffs[i].action === DiffAction.UPDATE) {
        // Consolidate property diffs - desiredCount.
        shouldConsolidateDiffs = true;
        diffs.splice(i, 1);
      }
    }

    if (shouldConsolidateDiffs) {
      diffs.push(new Diff(this, DiffAction.UPDATE, 'resourceId', ''));
    }

    return diffs;
  }

  override async diffInverse(
    diff: Diff,
    deReferenceResource: (
      resourceId: string,
    ) => Promise<AResource<EcsTaskDefinitionSchema, any> | AResource<SecurityGroupSchema, any>>,
  ): Promise<void> {
    if (diff.field === 'resourceId' && diff.action === DiffAction.UPDATE) {
      await this.cloneResourceInPlace(diff.node as EcsService, deReferenceResource);
    } else {
      await super.diffInverse(diff, deReferenceResource);
    }
  }

  private isEcsServiceSecurityGroup(resource: AResource<any, any>): boolean {
    return (resource.constructor as typeof AResource).NODE_NAME === 'security-group';
  }

  private isEcsServiceTaskDefinition(resource: AResource<any, any>): boolean {
    return (resource.constructor as typeof AResource).NODE_NAME === 'ecs-task-definition';
  }

  private updateServiceSecurityGroups(securityGroupParents: AResource<SecurityGroupSchema, any>[]): void {
    // Ensure there are no more than 5 security groups.
    if (securityGroupParents.length > 5) {
      throw new Error('Cannot have more than 5 security groups in ECS Service!');
    }

    for (const sgParent of securityGroupParents) {
      const ecsToSgDep = this.getDependency(sgParent, DependencyRelationship.CHILD)!;
      const sgToEcsDep = sgParent.getDependency(this, DependencyRelationship.PARENT)!;

      // Before updating ecs-service must add security-groups.
      ecsToSgDep.addBehavior('resourceId', DiffAction.UPDATE, 'resourceId', DiffAction.ADD);
      // Before deleting security-groups must update ecs-service.
      sgToEcsDep.addBehavior('resourceId', DiffAction.DELETE, 'resourceId', DiffAction.UPDATE);
    }
  }

  private updateServiceTaskDefinition(taskDefinitionParent: AResource<EcsTaskDefinitionSchema, any>): void {
    const ecsToTdDep = this.getDependency(taskDefinitionParent, DependencyRelationship.CHILD)!;

    // Before updating ecs-service must add ecs-task-definition.
    ecsToTdDep.addBehavior('resourceId', DiffAction.UPDATE, 'resourceId', DiffAction.ADD);
    // Before updating ecs-service must update ecs-task-definition.
    ecsToTdDep.addBehavior('resourceId', DiffAction.UPDATE, 'resourceId', DiffAction.UPDATE);
  }
}
