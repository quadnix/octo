import {
  type Constructable,
  NodeType,
  type UnknownAnchor,
  type UnknownModel,
  type UnknownOverlay,
} from '../app.type.js';
import { NodeError, SchemaError, ValidationTransactionError } from '../errors/index.js';
import { Container } from '../functions/container/container.js';
import { Diff, DiffAction } from '../functions/diff/diff.js';
import { DiffUtility } from '../functions/diff/diff.utility.js';
import { ANode } from '../functions/node/node.abstract.js';
import { getSchemaInstance } from '../functions/schema/schema.js';
import type { AAnchor } from '../overlays/anchor.abstract.js';
import type { BaseAnchorSchema } from '../overlays/anchor.schema.js';
import type { AResource } from '../resources/resource.abstract.js';
import type { BaseResourceSchema } from '../resources/resource.schema.js';
import { InputService } from '../services/input/input.service.js';
import { SchemaTranslationService } from '../services/schema-translation/schema-translation.service.js';
import type { IModel } from './model.interface.js';

export abstract class AModel<S, T extends UnknownModel> extends ANode<S, T> implements IModel<S, T> {
  private readonly anchors: UnknownAnchor[] = [];

  addAnchor(anchor: UnknownAnchor): void {
    const existingAnchor = this.getAnchor(anchor.anchorId, anchor.getParent());
    if (existingAnchor) {
      throw new NodeError('Anchor already exists!', this);
    } else {
      this.anchors.push(anchor);
    }
  }

  deriveDependencyField(): string | undefined {
    if (this.getDependencies().length === 0 && (this.constructor as typeof ANode).NODE_NAME === 'app') {
      return 'name';
    }

    return this.getDependencies()
      .find((d) => d.getRelationship() !== undefined)
      ?.getRelationship()!.onField;
  }

  override async diff(): Promise<Diff[]> {
    const diffs: Diff[] = [];

    const field = this.deriveDependencyField();
    if (!field) {
      throw new NodeError('Cannot derive dependency field!', this);
    }

    const currentChildrenByModels = this.getChildren();
    for (const modelName of Object.keys(currentChildrenByModels)) {
      const previousChildren = [];
      const currentChildren = currentChildrenByModels[modelName].map((d) => d.to);
      const field = currentChildrenByModels[modelName][0].getRelationship()!.toField;
      const childrenDiffs = await DiffUtility.diffNodes(previousChildren, currentChildren, field as string);
      diffs.push(...childrenDiffs);
    }

    const currentSiblingsByModels = this.getSiblings();
    for (const modelName of Object.keys(currentSiblingsByModels)) {
      const currentSiblings = currentSiblingsByModels[modelName];

      for (const cd of currentSiblings) {
        // Skip OVERLAY sibling, since overlays are diffed separately.
        if ((cd.to.constructor as typeof ANode).NODE_TYPE === NodeType.OVERLAY) {
          continue;
        }

        diffs.push(new Diff(this, DiffAction.ADD, 'sibling', cd.to));
      }
    }

    // Add model.
    diffs.push(new Diff(this, DiffAction.ADD, field, this[field]));

    // Diff model properties.
    const propertyDiffs = await this.diffProperties();
    diffs.push(...propertyDiffs);

    return diffs;
  }

  override async diffProperties(): Promise<Diff[]> {
    return [];
  }

  getAnchor(anchorId: string, parent?: UnknownModel): UnknownAnchor | undefined {
    const index = this.getAnchorIndex(anchorId, parent);
    return index > -1 ? this.anchors[index] : undefined;
  }

  getAnchorIndex(anchorId: string, parent?: UnknownModel): number {
    return this.anchors.findIndex(
      (a) => a.anchorId === anchorId && a.getParent().getContext() === (parent || this).getContext(),
    );
  }

  getAnchors(
    filters: { key: string; value: unknown }[] = [],
    types: Constructable<UnknownAnchor>[] = [],
  ): UnknownAnchor[] {
    return this.anchors
      .filter((a) => !types.length || types.some((t) => a instanceof t))
      .filter((a) => filters.every((c) => a.properties[c.key] === c.value));
  }

  async getAnchorsMatchingSchema<S extends BaseAnchorSchema>(
    from: Constructable<S>,
    propertyFilters: { key: string; value: unknown }[] = [],
  ): Promise<[S, AAnchor<S, any>][]> {
    const matches: [S, AAnchor<S, any>][] = [];
    const container = Container.getInstance();
    const schemaTranslationService = await container.get(SchemaTranslationService);

    const translatedSchema = schemaTranslationService.getTranslatedSchema<S, any>(from);
    if (translatedSchema) {
      from = translatedSchema.schema;
    }

    const anchors = this.getAnchors();
    while (anchors.length > 0) {
      const anchor = anchors.shift()!;

      try {
        const schemaInstance = getSchemaInstance(from, anchor.synth() as unknown as Record<string, unknown>);
        const matchingSchemaInstance = (
          translatedSchema ? translatedSchema.translator(schemaInstance) : anchor.synth()
        ) as S;

        if (propertyFilters.every((f) => matchingSchemaInstance.properties[f.key] === f.value)) {
          matches.push([matchingSchemaInstance, anchor as AAnchor<S, any>]);
        }
      } catch (error) {
        if (!(error instanceof SchemaError) && !(error instanceof ValidationTransactionError)) {
          throw error;
        }
      }
    }

    return matches;
  }

  async getModelsMatchingSchema<S>(
    schema: Constructable<S>,
    filters: { key: string; value: unknown }[] = [],
  ): Promise<[S, AModel<S, any>][]> {
    const matches: [S, AModel<S, any>][] = [];
    const container = Container.getInstance();
    const schemaTranslationService = await container.get(SchemaTranslationService);

    const translatedSchema = schemaTranslationService.getTranslatedSchema<S, any>(schema);
    if (translatedSchema) {
      schema = translatedSchema.schema;
    }

    const models = this.getBoundaryMembers() as UnknownModel[];
    while (models.length > 0) {
      const model = models.shift()!;

      try {
        const schemaInstance = getSchemaInstance(schema, model.synth() as Record<string, unknown>);
        const matchingSchemaInstance = (
          translatedSchema ? translatedSchema.translator(schemaInstance) : model.synth()
        ) as S;

        if (filters.every((f) => matchingSchemaInstance[f.key] === f.value)) {
          matches.push([matchingSchemaInstance, model as AModel<S, any>]);
        }
      } catch (error) {
        if (!(error instanceof SchemaError) && !(error instanceof ValidationTransactionError)) {
          throw error;
        }
      }
    }

    return matches;
  }

  async getResourcesMatchingSchema<S extends BaseResourceSchema>(
    schema: Constructable<S>,
    propertyFilters: { key: string; value: unknown }[] = [],
    responseFilters: { key: string; value: unknown }[] = [],
  ): Promise<[S, AResource<S, any>][]> {
    const matches: [S, AResource<S, any>][] = [];
    const container = Container.getInstance();
    const [inputService, schemaTranslationService] = await Promise.all([
      container.get(InputService),
      container.get(SchemaTranslationService),
    ]);

    const translatedSchema = schemaTranslationService.getTranslatedSchema<S, any>(schema);
    if (translatedSchema) {
      schema = translatedSchema.schema;
    }

    const models = this.getBoundaryMembers() as UnknownModel[];
    while (models.length > 0) {
      const model = models.shift()!;

      const moduleId =
        (model.constructor as typeof ANode).NODE_TYPE === NodeType.OVERLAY
          ? inputService.getModuleIdFromOverlay(model as UnknownOverlay)
          : inputService.getModuleIdFromModel(model);
      const moduleResources = inputService.getModuleResources(moduleId);
      moduleResources.forEach((r) => {
        try {
          const schemaInstance = getSchemaInstance(schema, r.synth());
          const matchingSchemaInstance = (
            translatedSchema ? translatedSchema.translator(schemaInstance) : r.synth()
          ) as S;

          if (
            propertyFilters.every((f) => matchingSchemaInstance.properties[f.key] === f.value) &&
            responseFilters.every((f) => matchingSchemaInstance.response[f.key] === f.value)
          ) {
            matches.push([matchingSchemaInstance, r]);
          }
        } catch (error) {
          if (!(error instanceof SchemaError) && !(error instanceof ValidationTransactionError)) {
            throw error;
          }
        }
      });
    }

    return matches;
  }

  removeAllAnchors(): void {
    const anchors = this.getAnchors();
    while (anchors.length > 0) {
      this.removeAnchor(anchors.shift()!);
    }
  }

  removeAnchor(anchor: UnknownAnchor): void {
    const existingAnchorIndex = this.getAnchorIndex(anchor.anchorId, anchor.getParent());
    if (existingAnchorIndex !== -1) {
      this.anchors.splice(existingAnchorIndex, 1);
    }
  }

  abstract override setContext(): string;

  abstract override synth(): S;

  static override async unSynth(...args: unknown[]): Promise<UnknownModel> {
    if (args.length > 4) {
      throw new Error('Too many args in unSynth()');
    }

    throw new Error('Method not implemented! Use derived class implementation');
  }
}
