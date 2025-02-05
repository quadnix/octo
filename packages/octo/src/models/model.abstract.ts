import {
  type Constructable,
  MatchingAnchor,
  MatchingModel,
  MatchingResource,
  NodeType,
  type ObjectKeyValue,
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
import { type AOverlay } from '../overlays/overlay.abstract.js';
import type { BaseOverlaySchema } from '../overlays/overlay.schema.js';
import type { AResource } from '../resources/resource.abstract.js';
import type { BaseResourceSchema } from '../resources/resource.schema.js';
import { InputService } from '../services/input/input.service.js';
import { SchemaTranslationService } from '../services/schema-translation/schema-translation.service.js';
import type { IModel } from './model.interface.js';

export abstract class AModel<S, T extends UnknownModel> extends ANode<S, T> implements IModel<S, T> {
  readonly anchors: (MatchingAnchor<BaseAnchorSchema> | UnknownAnchor)[] = [];

  addAnchor(anchor: MatchingAnchor<BaseAnchorSchema> | UnknownAnchor): void {
    const existingAnchor =
      anchor instanceof MatchingAnchor
        ? this.getAnchor(anchor.getActual().anchorId, anchor.getActual().getParent())
        : this.getAnchor(anchor.anchorId, anchor.getParent());
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
    if (index === -1) {
      return undefined;
    }

    const anchor = this.anchors[index];
    if (anchor instanceof MatchingAnchor) {
      return anchor.getActual();
    } else {
      return anchor;
    }
  }

  getAnchorIndex(anchorId: string, parent?: UnknownModel): number {
    return this.anchors.findIndex((a) => {
      if (a instanceof MatchingAnchor) {
        return (
          a.getActual().anchorId === anchorId &&
          a.getActual().getParent().getContext() === (parent || this).getContext()
        );
      } else {
        return a.anchorId === anchorId && a.getParent().getContext() === (parent || this).getContext();
      }
    });
  }

  getAnchors(
    filters: { key: string; value: unknown }[] = [],
    types: Constructable<MatchingAnchor<BaseAnchorSchema> | UnknownAnchor>[] = [],
  ): UnknownAnchor[] {
    return this.anchors
      .filter((a) => !types.length || types.some((t) => a instanceof t))
      .filter((a) =>
        filters.every((c) => {
          if (a instanceof MatchingAnchor) {
            return a.getSchemaInstance().properties[c.key] === c.value;
          } else {
            return a.properties[c.key] === c.value;
          }
        }),
      )
      .map((a) => (a instanceof MatchingAnchor ? a.getActual() : a));
  }

  async getAnchorsMatchingSchema<S extends BaseAnchorSchema>(
    from: Constructable<S>,
    propertyFilters: ObjectKeyValue<S['properties']>[] = [],
    { searchBoundaryMembers = true }: { searchBoundaryMembers?: boolean } = {},
  ): Promise<MatchingAnchor<S>[]> {
    const matches: [S, AAnchor<S, any>, ((synth: any) => S) | undefined][] = [];
    const container = Container.getInstance();
    const schemaTranslationService = await container.get(SchemaTranslationService);

    const translatedSchema = schemaTranslationService.getTranslatedSchema<S, any>(from);
    if (translatedSchema) {
      from = translatedSchema.schema;
    }

    const boundaryMembers = searchBoundaryMembers ? (this.getBoundaryMembers() as UnknownModel[]) : [this];
    const anchors = boundaryMembers.map((m) => m.getAnchors()).flat();
    while (anchors.length > 0) {
      const anchor = anchors.shift()!;

      try {
        const schemaInstance = getSchemaInstance(from, anchor.synth());
        const matchingSchemaInstance = (
          translatedSchema ? translatedSchema.translator(schemaInstance) : anchor.synth()
        ) as S;

        if (propertyFilters.every((f) => matchingSchemaInstance.properties[f.key as string] === f.value)) {
          matches.push([
            matchingSchemaInstance,
            anchor as AAnchor<S, any>,
            translatedSchema ? translatedSchema.translator : undefined,
          ]);
        }
      } catch (error) {
        if (!(error instanceof SchemaError) && !(error instanceof ValidationTransactionError)) {
          throw error;
        }
      }
    }

    return matches.map((m) => new MatchingAnchor(m[1], m[0], m[2]));
  }

  async getModelsMatchingSchema<S extends object>(
    schema: Constructable<S>,
    filters: ObjectKeyValue<S>[] = [],
    { searchBoundaryMembers = true }: { searchBoundaryMembers?: boolean } = {},
  ): Promise<MatchingModel<S>[]> {
    const matches: [S, AModel<S, any>, ((synth: any) => S) | undefined][] = [];
    const container = Container.getInstance();
    const schemaTranslationService = await container.get(SchemaTranslationService);

    const translatedSchema = schemaTranslationService.getTranslatedSchema<S, any>(schema);
    if (translatedSchema) {
      schema = translatedSchema.schema;
    }

    const models = searchBoundaryMembers ? (this.getBoundaryMembers() as UnknownModel[]) : [this];
    while (models.length > 0) {
      const model = models.shift()!;

      try {
        const schemaInstance = getSchemaInstance(schema, model.synth() as object);
        const matchingSchemaInstance = (
          translatedSchema ? translatedSchema.translator(schemaInstance) : model.synth()
        ) as S;

        if (filters.every((f) => matchingSchemaInstance[f.key] === f.value)) {
          matches.push([
            matchingSchemaInstance,
            model as AModel<S, any>,
            translatedSchema ? translatedSchema.translator : undefined,
          ]);
        }
      } catch (error) {
        if (!(error instanceof SchemaError) && !(error instanceof ValidationTransactionError)) {
          throw error;
        }
      }
    }

    return matches.map((m) => new MatchingModel(m[1], m[0], m[2]));
  }

  async getOverlaysMatchingSchema<S extends BaseOverlaySchema>(
    schema: Constructable<S>,
    propertyFilters: ObjectKeyValue<S['properties']>[] = [],
    { searchBoundaryMembers = true }: { searchBoundaryMembers?: boolean } = {},
  ): Promise<MatchingModel<S>[]> {
    const matches: [S, AModel<S, any>, ((synth: any) => S) | undefined][] = [];
    const container = Container.getInstance();
    const schemaTranslationService = await container.get(SchemaTranslationService);

    const translatedSchema = schemaTranslationService.getTranslatedSchema<S, any>(schema);
    if (translatedSchema) {
      schema = translatedSchema.schema;
    }

    const overlays = searchBoundaryMembers
      ? (this.getBoundaryMembers() as UnknownModel[]).filter(
          (m) => (m.constructor as typeof AOverlay).NODE_TYPE === NodeType.OVERLAY,
        )
      : [this];
    while (overlays.length > 0) {
      const overlay = overlays.shift()!;

      try {
        const schemaInstance = getSchemaInstance(schema, overlay.synth() as object);
        const matchingSchemaInstance = (
          translatedSchema ? translatedSchema.translator(schemaInstance) : overlay.synth()
        ) as S;

        if (propertyFilters.every((f) => matchingSchemaInstance.properties[f.key as string] === f.value)) {
          matches.push([
            matchingSchemaInstance,
            overlay as AModel<S, any>,
            translatedSchema ? translatedSchema.translator : undefined,
          ]);
        }
      } catch (error) {
        if (!(error instanceof SchemaError) && !(error instanceof ValidationTransactionError)) {
          throw error;
        }
      }
    }

    return matches.map((m) => new MatchingModel(m[1], m[0], m[2]));
  }

  async getResourcesMatchingSchema<S extends BaseResourceSchema>(
    schema: Constructable<S>,
    propertyFilters: ObjectKeyValue<S['properties']>[] = [],
    responseFilters: ObjectKeyValue<S['response']>[] = [],
    { searchBoundaryMembers = true }: { searchBoundaryMembers?: boolean } = {},
  ): Promise<MatchingResource<S>[]> {
    const matches: [S, AResource<S, any>, ((synth: any) => S) | undefined][] = [];
    const container = Container.getInstance();
    const [inputService, schemaTranslationService] = await Promise.all([
      container.get(InputService),
      container.get(SchemaTranslationService),
    ]);

    const translatedSchema = schemaTranslationService.getTranslatedSchema<S, any>(schema);
    if (translatedSchema) {
      schema = translatedSchema.schema;
    }

    const models = searchBoundaryMembers ? (this.getBoundaryMembers() as UnknownModel[]) : [this];
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
            propertyFilters.every((f) => matchingSchemaInstance.properties[f.key as string] === f.value) &&
            responseFilters.every((f) => matchingSchemaInstance.response[f.key as string] === f.value)
          ) {
            matches.push([matchingSchemaInstance, r, translatedSchema ? translatedSchema.translator : undefined]);
          }
        } catch (error) {
          if (!(error instanceof SchemaError) && !(error instanceof ValidationTransactionError)) {
            throw error;
          }
        }
      });
    }

    return matches.map((m) => new MatchingResource(m[1], m[0], m[2]));
  }

  removeAllAnchors(): void {
    const anchors = this.getAnchors();
    while (anchors.length > 0) {
      this.removeAnchor(anchors.shift()!);
    }
  }

  removeAnchor(anchor: MatchingAnchor<BaseAnchorSchema> | UnknownAnchor): void {
    const existingAnchorIndex =
      anchor instanceof MatchingAnchor
        ? this.getAnchorIndex(anchor.getActual().anchorId, anchor.getActual().getParent())
        : this.getAnchorIndex(anchor.anchorId, anchor.getParent());
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
