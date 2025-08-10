import {
  AResource,
  DependencyRelationship,
  Diff,
  DiffAction,
  type MatchingResource,
  Resource,
  ResourceError,
  hasNodeName,
} from '@quadnix/octo';
import type { AlbListenerSchema } from '../alb-listener/index.schema.js';
import type { AlbTargetGroupSchema } from '../alb-target-group/index.schema.js';
import type { EcsClusterSchema } from '../ecs-cluster/index.schema.js';
import type { EcsTaskDefinitionSchema } from '../ecs-task-definition/index.schema.js';
import type { SecurityGroupSchema } from '../security-group/index.schema.js';
import type { SubnetSchema } from '../subnet/index.schema.js';
import { EcsServiceSchema } from './index.schema.js';

/**
 * @internal
 */
@Resource<EcsService>('@octo', 'ecs-service', EcsServiceSchema)
export class EcsService extends AResource<EcsServiceSchema, EcsService> {
  declare parents: [
    MatchingResource<EcsClusterSchema>,
    MatchingResource<EcsTaskDefinitionSchema>,
    MatchingResource<SubnetSchema>,
    ...(MatchingResource<AlbTargetGroupSchema> | MatchingResource<SecurityGroupSchema>)[],
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
      ...(MatchingResource<AlbTargetGroupSchema> | MatchingResource<SecurityGroupSchema>)[],
    ],
  ) {
    super(resourceId, properties, parents);

    this.updateServiceTaskDefinition(parents[1].getActual());
    this.updateServiceAlbTargetGroups(
      parents
        .slice(3)
        .filter((p) => hasNodeName(p.getActual(), 'alb-target-group'))
        .map((p) => p.getActual() as AResource<AlbTargetGroupSchema, any>),
    );
    this.updateServiceSecurityGroups(
      parents
        .slice(3)
        .filter((p) => hasNodeName(p.getActual(), 'security-group'))
        .map((p) => p.getActual() as AResource<SecurityGroupSchema, any>),
    );
  }

  addAlbTargetGroup(
    albTargetGroup: MatchingResource<AlbTargetGroupSchema>,
    albListeners: MatchingResource<AlbListenerSchema>[],
    containerName: string,
  ): void {
    const { Name: targetGroupName, Port: containerPort } = albTargetGroup.getSchemaInstance().properties;
    const existingAlbTargetGroupParentDependencies = this.getParents('alb-target-group')['alb-target-group'];
    const existingTaskDefinitionParent = this.getParents('ecs-task-definition')['ecs-task-definition'][0]
      .to as AResource<EcsTaskDefinitionSchema, any>;

    if (this.properties.loadBalancers.find((lb) => lb.targetGroupName === targetGroupName)) {
      throw new ResourceError(`Target group "${targetGroupName}" is already registered with this service!`, this);
    }
    if (existingAlbTargetGroupParentDependencies?.length > 0) {
      throw new ResourceError('A Target group has already registered with this service!', this);
    }
    if (
      !existingTaskDefinitionParent.properties.images.find(
        (i) => i.name === containerName && i.ports.find((p) => p.containerPort === containerPort),
      )
    ) {
      throw new ResourceError(
        `Container "${containerName}" on port "${containerPort}" is not exposed by this service!`,
        this,
      );
    }

    this.properties.loadBalancers.push({
      containerName,
      containerPort,
      targetGroupName,
    });

    albTargetGroup.addChild('resourceId', this, 'resourceId');
    this.updateServiceAlbTargetGroups([albTargetGroup.getActual()]);

    for (const albListener of albListeners) {
      const { childToParentDependency, parentToChildDependency } = albListener.addChild(
        'resourceId',
        this,
        'resourceId',
      );
      childToParentDependency.addBehavior('resourceId', DiffAction.ADD, 'properties', DiffAction.UPDATE);
      parentToChildDependency.addBehavior('properties', DiffAction.UPDATE, 'resourceId', DiffAction.DELETE);
    }
  }

  override async diff(previous: EcsService): Promise<Diff[]> {
    const diffs: Diff[] = await super.diff(previous);

    let shouldConsolidateDiffs = false;
    for (let i = diffs.length - 1; i >= 0; i--) {
      if (diffs[i].field === 'parent' && hasNodeName(diffs[i].value as AResource<any, any>, 'security-group')) {
        // Consolidate all SecurityGroup parent updates into a single UPDATE diff.
        shouldConsolidateDiffs = true;
        diffs.splice(i, 1);
      } else if (
        diffs[i].field === 'parent' &&
        hasNodeName(diffs[i].value as AResource<any, any>, 'ecs-task-definition')
      ) {
        // Translate TaskDefinition parent update into a single UPDATE diff.
        shouldConsolidateDiffs = true;
        diffs.splice(i, 1);
      } else if (
        diffs[i].field === 'parent' &&
        hasNodeName(diffs[i].value as AResource<any, any>, 'alb-target-group')
      ) {
        // Consolidate all AlbTargetGroup parent updates into a single UPDATE diff.
        shouldConsolidateDiffs = true;
        diffs.splice(i, 1);
      } else if (diffs[i].field === 'parent' && hasNodeName(diffs[i].value as AResource<any, any>, 'alb-listener')) {
        // Remove the diff since we don't care when the listener is updated.
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
    diff: Diff<EcsService>,
    deReferenceResource: (
      resourceId: string,
    ) => Promise<AResource<EcsTaskDefinitionSchema, any> | AResource<SecurityGroupSchema, any>>,
  ): Promise<void> {
    if (diff.field === 'resourceId' && diff.action === DiffAction.UPDATE) {
      await this.cloneResourceInPlace(diff.node, deReferenceResource);
    } else {
      await super.diffInverse(diff, deReferenceResource);
    }
  }

  private updateServiceAlbTargetGroups(
    albTargetGroupParents: ReturnType<MatchingResource<AlbTargetGroupSchema>['getActual']>[],
  ): void {
    for (const albTargetGroupParent of albTargetGroupParents) {
      const ecsToAlbTargetGroupDep = this.getDependency(albTargetGroupParent, DependencyRelationship.CHILD)!;
      const albTargetGroupToEcsDep = albTargetGroupParent.getDependency(this, DependencyRelationship.PARENT)!;

      // Before updating ecs-service must add alb-target-groups.
      ecsToAlbTargetGroupDep.addBehavior('resourceId', DiffAction.UPDATE, 'resourceId', DiffAction.ADD);
      // Before deleting alb-target-groups must update ecs-service.
      albTargetGroupToEcsDep.addBehavior('resourceId', DiffAction.DELETE, 'resourceId', DiffAction.UPDATE);
    }
  }

  private updateServiceSecurityGroups(
    securityGroupParents: ReturnType<MatchingResource<SecurityGroupSchema>['getActual']>[],
  ): void {
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

  private updateServiceTaskDefinition(
    taskDefinitionParent: ReturnType<MatchingResource<EcsTaskDefinitionSchema>['getActual']>,
  ): void {
    const ecsToTdDep = this.getDependency(taskDefinitionParent, DependencyRelationship.CHILD)!;

    // Before updating ecs-service must add ecs-task-definition.
    ecsToTdDep.addBehavior('resourceId', DiffAction.UPDATE, 'resourceId', DiffAction.ADD);
    // Before updating ecs-service must update ecs-task-definition.
    ecsToTdDep.addBehavior('resourceId', DiffAction.UPDATE, 'resourceId', DiffAction.UPDATE);
  }
}
