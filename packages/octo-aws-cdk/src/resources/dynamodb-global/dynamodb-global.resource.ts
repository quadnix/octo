import {
  ATerraformResource,
  DependencyRelationship,
  Diff,
  DiffAction,
  DiffUtility,
  type MatchingResource,
  Resource,
  ResourceError,
  type TerraformModuleScope,
} from '@quadnix/octo';
import type { DynamoDBSchema } from '../dynamodb/index.schema.js';
import { DynamoDBGlobalSchema } from './index.schema.js';

export type ReplicaDiff = {
  action: 'add' | 'delete';
  properties: { awsAccountId: string; awsRegionId: string };
};

export type DynamoDBGlobalDiff = {
  replicaDiffs: ReplicaDiff[];
  tagUpdates: { awsAccountId: string; awsRegionId: string; tags: { [key: string]: string } }[];
};

/**
 * @internal
 */
@Resource<DynamoDBGlobal>('@octo', 'dynamodb-global', DynamoDBGlobalSchema)
export class DynamoDBGlobal extends ATerraformResource<DynamoDBGlobalSchema, DynamoDBGlobal> {
  declare parents: [MatchingResource<DynamoDBSchema>];
  declare properties: DynamoDBGlobalSchema['properties'];
  declare response: DynamoDBGlobalSchema['response'];

  constructor(
    resourceId: string,
    properties: DynamoDBGlobalSchema['properties'],
    parents: [MatchingResource<DynamoDBSchema>],
  ) {
    super(resourceId, properties, parents);

    this.updateDynamoDBGlobalDynamoDB(parents[0].getActual());
  }

  override async diff(previous: DynamoDBGlobal): Promise<Diff[]> {
    const diffs = await super.diff(previous);

    const replicaDiffs: ReplicaDiff[] = [];
    const currentReplicas = this.properties.replicas;
    const previousReplicas = previous.properties.replicas;
    for (const replica of previousReplicas) {
      if (
        !currentReplicas.find((i) => i.awsAccountId === replica.awsAccountId && i.awsRegionId === replica.awsRegionId)
      ) {
        replicaDiffs.push({
          action: 'delete',
          properties: { awsAccountId: replica.awsAccountId, awsRegionId: replica.awsRegionId },
        });
      }
    }
    for (const replica of currentReplicas) {
      if (
        !previousReplicas.find((i) => i.awsAccountId === replica.awsAccountId && i.awsRegionId === replica.awsRegionId)
      ) {
        replicaDiffs.push({
          action: 'add',
          properties: { awsAccountId: replica.awsAccountId, awsRegionId: replica.awsRegionId },
        });
      }
    }

    const tagUpdates: DynamoDBGlobalDiff['tagUpdates'] = [];
    for (const replica of currentReplicas) {
      tagUpdates.push({
        awsAccountId: replica.awsAccountId,
        awsRegionId: replica.awsRegionId,
        tags: { ...this.tags, ...(replica.tags || {}) },
      });
    }

    let shouldConsolidateUpdateDiffs = false;
    for (let i = diffs.length - 1; i >= 0; i--) {
      if (diffs[i].field === 'properties' || diffs[i].field === 'tags') {
        // Consolidate property and tag diffs.
        shouldConsolidateUpdateDiffs = true;
        diffs.splice(i, 1);
      }
    }

    if (shouldConsolidateUpdateDiffs) {
      diffs.push(
        new Diff<DynamoDBGlobal, DynamoDBGlobalDiff>(this, DiffAction.UPDATE, 'properties', {
          replicaDiffs: replicaDiffs,
          tagUpdates,
        }),
      );
    }

    return diffs;
  }

  override async diffInverse(
    diff: Diff<DynamoDBGlobal>,
    deReferenceResource: (resourceId: string) => Promise<never>,
  ): Promise<void> {
    if (diff.action === DiffAction.DELETE && diff.field === 'properties') {
      this.remove(true);
    } else if (diff.action === DiffAction.UPDATE && diff.field === 'properties') {
      await this.cloneResourceInPlace(diff.node, deReferenceResource);
    } else {
      await super.diffInverse(diff, deReferenceResource);
    }
  }

  override async diffProperties(previous: DynamoDBGlobal): Promise<Diff[]> {
    if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties, ['replicas'])) {
      throw new ResourceError('Cannot update DynamoDBGlobal immutable properties once it has been created!', this);
    }

    return super.diffProperties(previous);
  }

  override diffUnpack(diff: Diff): Diff[] {
    if (diff.action === DiffAction.ADD && diff.field === 'resourceId') {
      const replicaDiffs: ReplicaDiff[] = [];
      const currentReplicas = this.properties.replicas;
      for (const replica of currentReplicas) {
        replicaDiffs.push({
          action: 'add',
          properties: { awsAccountId: replica.awsAccountId, awsRegionId: replica.awsRegionId },
        });
      }

      const tagUpdates: DynamoDBGlobalDiff['tagUpdates'] = [];
      for (const replica of currentReplicas) {
        tagUpdates.push({
          awsAccountId: replica.awsAccountId,
          awsRegionId: replica.awsRegionId,
          tags: { ...this.tags, ...(replica.tags || {}) },
        });
      }

      return [
        new Diff<DynamoDBGlobal, DynamoDBGlobalDiff>(this, DiffAction.UPDATE, 'properties', {
          replicaDiffs,
          tagUpdates,
        }),
      ];
    } else if (diff.action === DiffAction.DELETE && diff.field === 'resourceId') {
      const replicaDiffs: ReplicaDiff[] = [];
      const currentReplicas = this.properties.replicas;
      for (const replica of currentReplicas) {
        replicaDiffs.push({
          action: 'delete',
          properties: { awsAccountId: replica.awsAccountId, awsRegionId: replica.awsRegionId },
        });
      }

      return [
        new Diff<DynamoDBGlobal, DynamoDBGlobalDiff>(this, DiffAction.DELETE, 'properties', {
          replicaDiffs,
          tagUpdates: [],
        }),
      ];
    } else {
      return [diff];
    }
  }

  override async toHCL(terraform: TerraformModuleScope): Promise<void> {
    const dynamoDBParent = this.parents[0] as MatchingResource<DynamoDBSchema>;
    const dynamoDBGlobalOctoResource = terraform.addOctoTerraformResource(this as DynamoDBGlobal);

    const outputs: Record<string, unknown> = {};

    for (const replica of this.properties.replicas) {
      const replicaTFResource = dynamoDBGlobalOctoResource.addTerraformResource(
        'aws_dynamodb_table_replica',
        `${this.resourceId}_${replica.awsRegionId}`,
        {
          global_table_arn: terraform.getRef(dynamoDBParent, 'TableArn'),
          provider: terraform.getProviderAliasRef(replica.awsAccountId, replica.awsRegionId),
        },
      );

      const replicaTags = { ...this.tags, ...(replica.tags || {}) };
      if (Object.keys(replicaTags).length > 0) {
        replicaTFResource.attribute('tags', replicaTags);
      }

      const key = `${replica.awsAccountId}:${replica.awsRegionId}`;
      outputs[`${key}:TableArn`] = terraform.raw(`${replicaTFResource.address}.arn`);
    }

    dynamoDBGlobalOctoResource.output(outputs);
  }

  private updateDynamoDBGlobalDynamoDB(
    dynamoDBParent: ReturnType<MatchingResource<DynamoDBSchema>['getActual']>,
  ): void {
    const globalToTableDep = this.getDependency(dynamoDBParent, DependencyRelationship.CHILD)!;
    const tableToGlobalDep = dynamoDBParent.getDependency(this, DependencyRelationship.PARENT)!;

    // Before update/delete DynamoDBGlobal must add/update DynamoDB.
    globalToTableDep.addBehavior('properties', DiffAction.UPDATE, 'resourceId', DiffAction.ADD);
    globalToTableDep.addBehavior('properties', DiffAction.UPDATE, 'properties', DiffAction.UPDATE);
    globalToTableDep.addBehavior('properties', DiffAction.UPDATE, 'tags', DiffAction.UPDATE);
    globalToTableDep.addBehavior('properties', DiffAction.DELETE, 'resourceId', DiffAction.ADD);
    globalToTableDep.addBehavior('properties', DiffAction.DELETE, 'properties', DiffAction.UPDATE);
    globalToTableDep.addBehavior('properties', DiffAction.DELETE, 'tags', DiffAction.UPDATE);
    // Before deleting DynamoDB must update DynamoDBGlobal.
    tableToGlobalDep.addBehavior('resourceId', DiffAction.DELETE, 'properties', DiffAction.UPDATE);
    tableToGlobalDep.addBehavior('resourceId', DiffAction.DELETE, 'properties', DiffAction.DELETE);
  }
}
