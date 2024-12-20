import { AResource, DependencyRelationship, Diff, DiffAction, Resource, getSchemaInstance } from '@quadnix/octo';
import assert from 'node:assert';
import {
  EcsServiceSchema,
  EcsServiceSecurityGroup,
  EcsServiceSecurityGroupSchema,
  EcsServiceSubnet,
  EcsServiceSubnetSchema,
  EcsServiceTaskDefinition,
  EcsServiceTaskDefinitionSchema,
  EcsTaskDefinitionEcsCluster,
  EcsTaskDefinitionEcsClusterSchema,
} from './ecs-service.schema.js';

@Resource<EcsService>('@octo', 'ecs-service', EcsServiceSchema)
export class EcsService extends AResource<EcsServiceSchema, EcsService> {
  declare properties: EcsServiceSchema['properties'];
  declare response: EcsServiceSchema['response'];

  constructor(
    resourceId: string,
    properties: EcsServiceSchema['properties'],
    parents: [EcsTaskDefinitionEcsCluster, EcsServiceTaskDefinition, EcsServiceSubnet, ...EcsServiceSecurityGroup[]],
  ) {
    assert.strictEqual((parents[0].constructor as typeof AResource).NODE_NAME, 'ecs-cluster');
    getSchemaInstance(EcsTaskDefinitionEcsClusterSchema, parents[0].synth() as unknown as Record<string, unknown>);
    assert.strictEqual((parents[1].constructor as typeof AResource).NODE_NAME, 'ecs-task-definition');
    getSchemaInstance(EcsServiceTaskDefinitionSchema, parents[1].synth() as unknown as Record<string, unknown>);
    assert.strictEqual((parents[2].constructor as typeof AResource).NODE_NAME, 'subnet');
    getSchemaInstance(EcsServiceSubnetSchema, parents[2].synth() as unknown as Record<string, unknown>);
    parents.slice(3).every((p) => {
      assert.strictEqual((p.constructor as typeof AResource).NODE_NAME, 'security-group');
      getSchemaInstance(EcsServiceSecurityGroupSchema, p.synth() as unknown as Record<string, unknown>);
      return true;
    });

    super(resourceId, properties, parents);

    this.updateServiceSecurityGroups(
      parents.filter((p) => this.isEcsServiceSecurityGroup(p)) as EcsServiceSecurityGroup[],
    );
    this.updateServiceTaskDefinition(
      parents.find((p) => this.isEcsServiceTaskDefinition(p)) as EcsServiceTaskDefinition,
    );
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
    deReferenceResource: (resourceId: string) => Promise<EcsServiceTaskDefinition | EcsServiceSecurityGroup>,
  ): Promise<void> {
    if (diff.field === 'resourceId' && diff.action === DiffAction.UPDATE) {
      await this.cloneResourceInPlace(diff.node as EcsService, deReferenceResource);
    } else {
      await super.diffInverse(diff, deReferenceResource);
    }
  }

  private isEcsServiceSecurityGroup(node: AResource<any, any>): boolean {
    return node.response.hasOwnProperty('GroupId');
  }

  private isEcsServiceTaskDefinition(node: AResource<any, any>): boolean {
    return node.response.hasOwnProperty('taskDefinitionArn');
  }

  private updateServiceSecurityGroups(securityGroupParents: EcsServiceSecurityGroup[]): void {
    for (const sgParent of securityGroupParents) {
      const ecsToSgDep = this.getDependency(sgParent, DependencyRelationship.CHILD)!;
      const sgToEcsDep = sgParent.getDependency(this, DependencyRelationship.PARENT)!;

      // Before updating ecs-service must add security-groups.
      ecsToSgDep.addBehavior('resourceId', DiffAction.UPDATE, 'resourceId', DiffAction.ADD);
      // Before deleting security-groups must update ecs-service.
      sgToEcsDep.addBehavior('resourceId', DiffAction.DELETE, 'resourceId', DiffAction.UPDATE);
    }
  }

  private updateServiceTaskDefinition(taskDefinitionParent: EcsServiceTaskDefinition): void {
    const ecsToTdDep = this.getDependency(taskDefinitionParent, DependencyRelationship.CHILD)!;

    // Before updating ecs-service must add ecs-task-definition.
    ecsToTdDep.addBehavior('resourceId', DiffAction.UPDATE, 'resourceId', DiffAction.ADD);
    // Before updating ecs-service must update ecs-task-definition.
    ecsToTdDep.addBehavior('resourceId', DiffAction.UPDATE, 'resourceId', DiffAction.UPDATE);
  }

  static override async unSynth(
    _deserializationClass: any,
    resource: EcsServiceSchema,
    parentContexts: string[],
    deReferenceResource: (context: string) => Promise<any>,
  ): Promise<EcsService> {
    const parents = await Promise.all(parentContexts.map((p) => deReferenceResource(p)));
    const ecsCluster = parents.find((p) => p.constructor.NODE_NAME === 'ecs-cluster');
    const ecsTaskDefinition = parents.find((p) => p.constructor.NODE_NAME === 'ecs-task-definition');
    const subnet = parents.find((p) => p.constructor.NODE_NAME === 'subnet');
    const securityGroups = parents.filter((p) => p.constructor.NODE_NAME === 'security-group');

    const newResource = new EcsService(resource.resourceId, resource.properties, [
      ecsCluster,
      ecsTaskDefinition,
      subnet,
      ...securityGroups,
    ]);
    for (const key of Object.keys(resource.response)) {
      newResource.response[key] = resource.response[key];
    }
    return newResource;
  }
}
