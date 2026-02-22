import { AResource, Diff, DiffAction, DiffUtility, Resource, ResourceError } from '@quadnix/octo';
import { DynamoDBSchema, DynamoDBSecondaryIndexSchema } from './index.schema.js';

export type GlobalSecondaryIndexDiffs = {
  action: 'add' | 'delete';
  properties: DynamoDBSecondaryIndexSchema;
};

export type DynamoDBDiff = {
  GlobalSecondaryIndexDiffs: GlobalSecondaryIndexDiffs[];
};

/**
 * @internal
 */
@Resource<DynamoDB>('@octo', 'dynamodb', DynamoDBSchema)
export class DynamoDB extends AResource<DynamoDBSchema, DynamoDB> {
  declare properties: DynamoDBSchema['properties'];
  declare response: DynamoDBSchema['response'];

  constructor(resourceId: string, properties: DynamoDBSchema['properties']) {
    super(resourceId, properties, []);

    // PROVISIONED billing mode requires ProvisionedThroughput.
    if (properties.billingMode.type === 'PROVISIONED' && !properties.billingMode.settings.ProvisionedThroughput) {
      throw new ResourceError(
        `DynamoDB table "${properties.TableName}" requires ProvisionedThroughput when billingMode is PROVISIONED!`,
        this,
      );
    }

    // KeySchema must have valid HASH and RANGE keys defined.
    // Since max array length can be 2, having checked for a HASH key automatically verifies the other key.
    if (properties.KeySchema.filter((s) => s.KeyType === 'HASH').length !== 1) {
      throw new ResourceError(
        `DynamoDB table "${properties.TableName}" must have 1 HASH key, and at max one RANGE key!`,
        this,
      );
    }

    // GSIs require StreamSpecification to be present for replication.
    if (!properties.StreamSpecification) {
      throw new ResourceError(
        `DynamoDB table "${properties.TableName}" must have StreamSpecification defined when GSIs are present!`,
        this,
      );
    }

    // GSIs KeySchema must have valid HASH and RANGE keys defined.
    // Since max array length can be 2, having checked for a HASH key automatically verifies the other key.
    if (!properties.GlobalSecondaryIndexes.every((i) => i.KeySchema.filter((s) => s.KeyType === 'HASH').length === 1)) {
      throw new ResourceError(
        `DynamoDB table "${properties.TableName}" GSIs must have 1 HASH key, and at max one RANGE key!`,
        this,
      );
    }

    // GSI INCLUDE projection requires NonKeyAttributes.
    if (
      !properties.GlobalSecondaryIndexes.every((i) =>
        i.Projection.ProjectionType === 'INCLUDE' ? i.Projection.NonKeyAttributes?.length : true,
      )
    ) {
      throw new ResourceError(
        `DynamoDB table "${properties.TableName}" GSIs with Projection INCLUDE must specify NonKeyAttribute!`,
        this,
      );
    }

    // GSI NonKeyAttribute length must not exceed 20.
    if (!properties.GlobalSecondaryIndexes.every((i) => (i.Projection.NonKeyAttributes?.length || 0) <= 20)) {
      throw new ResourceError(
        `DynamoDB table "${properties.TableName}" GSIs NonKeyAttribute length must not exceed 20!`,
        this,
      );
    }

    // LSI requires the primary KeySchema to have a RANGE key.
    if (!properties.KeySchema.some((s) => s.KeyType === 'RANGE')) {
      throw new ResourceError(
        `DynamoDB table "${properties.TableName}" must have a RANGE key in KeySchema when defining LSIs!`,
        this,
      );
    }

    // Each LSI must share the primary table's HASH key.
    const primaryHashKey = properties.KeySchema.find((s) => s.KeyType === 'HASH')!.AttributeName;
    if (
      !properties.LocalSecondaryIndexes.every(
        (i) => i.KeySchema.find((s) => s.KeyType === 'HASH')?.AttributeName === primaryHashKey,
      )
    ) {
      throw new ResourceError(
        `DynamoDB table "${properties.TableName}" LSIs must share the primary table's HASH key!`,
        this,
      );
    }

    // Each LSI must have a RANGE key.
    if (!properties.LocalSecondaryIndexes.every((i) => i.KeySchema.some((s) => s.KeyType === 'RANGE'))) {
      throw new ResourceError(
        `DynamoDB table "${properties.TableName}" LSI KeySchema must contain exactly one HASH and one RANGE key!`,
        this,
      );
    }

    // LSI INCLUDE projection requires NonKeyAttributes.
    if (
      !properties.LocalSecondaryIndexes.every((i) =>
        i.Projection.ProjectionType === 'INCLUDE' ? i.Projection.NonKeyAttributes?.length : true,
      )
    ) {
      throw new ResourceError(
        `DynamoDB table "${properties.TableName}" LSIs with Projection INCLUDE must specify NonKeyAttribute!`,
        this,
      );
    }

    // LSI NonKeyAttribute length must not exceed 20.
    if (!properties.LocalSecondaryIndexes.every((i) => (i.Projection.NonKeyAttributes?.length || 0) <= 20)) {
      throw new ResourceError(
        `DynamoDB table "${properties.TableName}" LSIs NonKeyAttribute length must not exceed 20!`,
        this,
      );
    }

    // Ensure unique IndexNames across LSIs and GSIs.
    const allIndexes = [
      ...properties.GlobalSecondaryIndexes.map((i) => i.IndexName),
      ...properties.LocalSecondaryIndexes.map((i) => i.IndexName),
    ];
    if (allIndexes.length !== new Set(allIndexes).size) {
      throw new ResourceError(
        `DynamoDB table "${properties.TableName}" has duplicate index names across LSIs and GSIs!`,
        this,
      );
    }

    // All attribute names defined in KeySchema, LSIs, or GSIs must appear in AttributeDefinitions.
    const attributeNamesInSchema = [
      ...properties.KeySchema.map((s) => s.AttributeName),
      ...properties.GlobalSecondaryIndexes.flatMap((g) => g.KeySchema.map((s) => s.AttributeName)),
      ...properties.LocalSecondaryIndexes.flatMap((l) => l.KeySchema.map((s) => s.AttributeName)),
    ];
    if (!attributeNamesInSchema.every((n) => properties.AttributeDefinitions.find((d) => d.AttributeName === n))) {
      throw new ResourceError(
        `DynamoDB table "${properties.TableName}" AttributeDefinitions is missing AttributeName referenced in KeySchema, LSIs, or GSIs!`,
        this,
      );
    }

    // There shouldn't be an attribute name defined in AttributeDefinitions that is not referenced in any schema.
    if (properties.AttributeDefinitions.length !== new Set(attributeNamesInSchema).size) {
      throw new ResourceError(
        `DynamoDB table "${properties.TableName}" AttributeDefinitions has definitions not referenced in any schema!`,
        this,
      );
    }
  }

  override async diff(previous: DynamoDB): Promise<Diff[]> {
    const diffs = await super.diff(previous);

    const globalSecondaryIndexDiffs: GlobalSecondaryIndexDiffs[] = [];
    const currentGSIs = this.properties.GlobalSecondaryIndexes;
    const previousGSIs = previous.properties.GlobalSecondaryIndexes;
    for (const index of previousGSIs) {
      if (!currentGSIs.find((i) => i.IndexName === index.IndexName)) {
        globalSecondaryIndexDiffs.push({ action: 'delete', properties: { ...index } });
      }
    }
    for (const index of currentGSIs) {
      if (!previousGSIs.find((i) => i.IndexName === index.IndexName)) {
        globalSecondaryIndexDiffs.push({ action: 'add', properties: { ...index } });
      }
    }
    if (globalSecondaryIndexDiffs.filter((d) => d.action === 'add').length > 1) {
      throw new ResourceError(
        `DynamoDB table "${this.properties.TableName}" cannot add more than 1 GSI at a time!`,
        this,
      );
    }

    let shouldConsolidateUpdateDiffs = false;
    for (let i = diffs.length - 1; i >= 0; i--) {
      if (diffs[i].field === 'properties') {
        // Consolidate property diffs.
        shouldConsolidateUpdateDiffs = true;
        diffs.splice(i, 1);
      }
    }

    if (shouldConsolidateUpdateDiffs) {
      diffs.push(
        new Diff<DynamoDB, DynamoDBDiff>(this, DiffAction.UPDATE, 'properties', {
          GlobalSecondaryIndexDiffs: globalSecondaryIndexDiffs,
        }),
      );
    }

    return diffs;
  }

  override async diffInverse(
    diff: Diff<DynamoDB>,
    deReferenceResource: (resourceId: string) => Promise<never>,
  ): Promise<void> {
    if (diff.action === DiffAction.UPDATE && diff.field === 'properties') {
      await this.cloneResourceInPlace(diff.node, deReferenceResource);
    } else {
      await super.diffInverse(diff, deReferenceResource);
    }
  }

  override async diffProperties(previous: DynamoDB): Promise<Diff[]> {
    if (
      !DiffUtility.isObjectDeepEquals(previous.properties, this.properties, [
        'AttributeDefinitions',
        'billingMode',
        'GlobalSecondaryIndexes',
        'StreamSpecification',
        'timeToLiveAttribute',
      ])
    ) {
      throw new ResourceError('Cannot update DynamoDB immutable properties once it has been created!', this);
    }

    // Existing GSIs cannot be updated.
    const currentGSIs = this.properties.GlobalSecondaryIndexes;
    const previousGSIs = previous.properties.GlobalSecondaryIndexes;
    for (const ci of currentGSIs) {
      const pi = previousGSIs.find((pi) => pi.IndexName === ci.IndexName);
      if (pi && !DiffUtility.isObjectDeepEquals(ci, pi)) {
        throw new ResourceError('Cannot update DynamoDB GSIs immutable properties once it has been created!', this);
      }
    }

    return super.diffProperties(previous);
  }
}
