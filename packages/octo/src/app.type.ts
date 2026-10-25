import type { IDependency } from './functions/dependency/dependency.js';
import type { ANode } from './functions/node/node.abstract.js';
import type { IModelAction } from './models/model-action.interface.js';
import type { AModel } from './models/model.abstract.js';
import type { IModel, IModelReference } from './models/model.interface.js';
import type { AModule } from './modules/module.abstract.js';
import type { AAnchor } from './overlays/anchor.abstract.js';
import type { BaseAnchorSchema } from './overlays/anchor.schema.js';
import type { AOverlay } from './overlays/overlay.abstract.js';
import type { BaseOverlaySchema } from './overlays/overlay.schema.js';
import type { IResourceAction } from './resources/resource-action.interface.js';
import type { AResource } from './resources/resource.abstract.js';
import type { BaseResourceSchema } from './resources/resource.schema.js';
import type { ValidationUtility } from './utilities/validation/validation.utility.js';

/* Classes */

/**
 * An anchor found by schema, paired with the translation needed to read it as that schema.
 *
 * {@link AModel.getAnchorsMatchingSchema} returns these rather than raw anchors: the anchor you
 * matched may have been declared against a different version of the schema, and this is what keeps
 * that difference out of your module. Read it with `getSchemaInstance()`.
 *
 * @group Types
 */
export class MatchingAnchor<S extends BaseAnchorSchema> {
  /**
   * @param actual The anchor that was matched.
   * @param schemaTranslator Reads `actual` as the matched schema, when the two differ.
   */
  constructor(
    private readonly actual: AAnchor<S, any>,
    private readonly schemaTranslator?: (synth: any) => S,
  ) {}

  /**
   * The anchor itself, with its properties hidden - read those through
   * {@link MatchingAnchor.getSchemaInstance}.
   */
  getActual(): AAnchor<Omit<S, 'properties'> & { properties: Record<never, never> }, any> {
    return this.actual;
  }

  /**
   * The anchor read as the schema you matched on.
   */
  getSchemaInstance(): S {
    return this.hasSchemaTranslator() ? this.schemaTranslator!(this.actual.synth()) : (this.actual.synth() as S);
  }

  /**
   * Whether the match went through a schema translation.
   */
  hasSchemaTranslator(): boolean {
    return !!this.schemaTranslator;
  }
}

/**
 * A model found by schema. See {@link MatchingAnchor}.
 *
 * @group Types
 */
export class MatchingModel<S extends object> {
  /**
   * @param actual The model that was matched.
   * @param schemaTranslator Reads `actual` as the matched schema, when the two differ.
   */
  constructor(
    private readonly actual: AModel<S, any>,
    private readonly schemaTranslator?: (synth: any) => S,
  ) {}

  /**
   * The model itself, with its schema hidden - read it through
   * {@link MatchingModel.getSchemaInstance}.
   */
  getActual(): AModel<Record<never, never>, any> {
    return this.actual;
  }

  /**
   * The model read as the schema you matched on.
   */
  getSchemaInstance(): S {
    return this.hasSchemaTranslator() ? this.schemaTranslator!(this.actual.synth()) : (this.actual.synth() as S);
  }

  /**
   * Whether the match went through a schema translation.
   */
  hasSchemaTranslator(): boolean {
    return !!this.schemaTranslator;
  }
}

/**
 * A resource found by schema. See {@link MatchingAnchor}.
 *
 * Pass one wherever a resource parent is expected, and the translation is carried into the graph, so
 * the child keeps reading its parent through the schema it was written against.
 *
 * @group Types
 */
export class MatchingResource<S extends BaseResourceSchema> {
  /**
   * @param actual The resource that was matched.
   * @param schemaTranslator Reads `actual` as the matched schema, when the two differ.
   */
  constructor(
    private readonly actual: AResource<S, any>,
    readonly schemaTranslator?: (synth: BaseResourceSchema) => S,
  ) {}

  /**
   * @internal
   */
  addChild(
    ...args: Parameters<AResource<BaseResourceSchema, any>['addChild']>
  ): ReturnType<AResource<BaseResourceSchema, any>['addChild']> {
    const results = this.actual.addChild(...args);

    if (
      !(args[1].parents[args[1].parents.length - 1] instanceof MatchingResource) &&
      (args[1].parents[args[1].parents.length - 1] as UnknownResource).resourceId === this.getActual().resourceId
    ) {
      args[1].parents.pop();
      args[1].parents.push(this);
    }

    return results;
  }

  /**
   * The resource itself, with its schema hidden - read it through
   * {@link MatchingResource.getSchemaInstance}.
   */
  getActual(): AResource<
    Omit<S, 'properties' | 'response' | 'tags'> & { properties: Record<never, never> } & {
      response: Record<never, never>;
    } & { tags: Record<never, never> },
    any
  > {
    return this.actual;
  }

  /**
   * The resource read as the schema you matched on.
   */
  getSchemaInstance(): S {
    return this.hasSchemaTranslator() ? this.schemaTranslator!(this.actual.synth()) : (this.actual.synth() as S);
  }

  /**
   * The resource read as the schema you matched on, with its `response` typed as fully populated.
   * Only call it from a resource action, where the parent is guaranteed to already exist.
   */
  getSchemaInstanceInResourceAction(): Omit<S, 'response'> & { response: Required<S['response']> } {
    return this.getSchemaInstance() as unknown as Omit<S, 'response'> & { response: Required<S['response']> };
  }

  /**
   * Whether the match went through a schema translation.
   */
  hasSchemaTranslator(): boolean {
    return !!this.schemaTranslator;
  }
}

/* Enumerations */

/**
 * @internal
 */
export enum NodeType {
  MODEL = 'model',
  OVERLAY = 'overlay',
  RESOURCE = 'resource',
}

/**
 * @internal
 */
export enum ValidationType {
  CUSTOM = 'custom',
  IS_MODEL = 'isModel',
  IS_OVERLAY = 'isOverlay',
  IS_RESOURCE = 'isResource',
  IS_SCHEMA = 'isSchema',
  MAX_LENGTH = 'maxLength',
  MIN_LENGTH = 'minLength',
  REGEX = 'regex',
}

/**
 * @internal
 */
export type ValidationTypeOptions = {
  [ValidationType.CUSTOM]: Parameters<typeof ValidationUtility.validateCustom>[1];
  [ValidationType.IS_MODEL]: Parameters<typeof ValidationUtility.validateIsModel>[1];
  [ValidationType.IS_OVERLAY]: Parameters<typeof ValidationUtility.validateIsOverlay>[1];
  [ValidationType.IS_RESOURCE]: Parameters<typeof ValidationUtility.validateIsResource>[1];
  [ValidationType.IS_SCHEMA]: Parameters<typeof ValidationUtility.validateIsSchema>[1];
  [ValidationType.MAX_LENGTH]: Parameters<typeof ValidationUtility.validateMaxLength>[1];
  [ValidationType.MIN_LENGTH]: Parameters<typeof ValidationUtility.validateMinLength>[1];
  [ValidationType.REGEX]: Parameters<typeof ValidationUtility.validateRegex>[1];
};

/* Functions */

/**
 * Whether a node was registered under the given name, e.g. `region`.
 *
 * Use it to identify a base model without importing the subclass that implements it.
 *
 * @group Types
 */
export function hasNodeName(node: UnknownNode, nodeName: string): boolean {
  return (node.constructor as typeof ANode).NODE_NAME === nodeName;
}

/**
 * Marks a placeholder value that a later step fills in - typically a resource property whose real
 * value is only known once the infrastructure exists.
 *
 * It is a type assertion and nothing more; it emits the string you give it.
 *
 * @group Types
 */
export function stub<T>(value: string): T {
  return value as T;
}

/* Types */

/**
 * @internal
 */
export type ActionInputs = EnhancedModuleSchema<UnknownModule>;

/**
 * The resources an action declared, keyed by an ID of your choosing.
 *
 * @group Types
 */
export type ActionOutputs = { [key: string]: UnknownResource };

/**
 * @internal
 */
export type ClassRequiredProperties<T> = {
  [K in keyof T]: undefined extends T[K] ? never : K;
}[keyof T];
export type ClassOptionalProperties<T> = {
  [K in keyof T]: undefined extends T[K] ? K : never;
}[keyof T];

/**
 * The `value` of a {@link Diff} on a `properties` field: which property changed, and to what.
 *
 * @group Types
 */
export type DiffValueTypePropertyUpdate = {
  key: string;
  value: unknown;
};

/**
 * The `value` of a {@link Diff} on a `tags` field, split by what happened to each tag.
 *
 * @group Types
 */
export type DiffValueTypeTagUpdate = {
  add: { [key: string]: string };
  delete: string[];
  update: { [key: string]: string };
};

/**
 * @internal
 */
export type ObjectKeyValue<T> = { [K in keyof T]: { key: K; value: T[K] } }[keyof T];

/**
 * The class of `T`, i.e. what you pass when an API wants a type rather than an instance.
 *
 * @group Types
 */
export type Constructable<T> = new (...args: any[]) => T;

/**
 * A class of `T`, abstract or not, i.e. what you pass to name a family of classes.
 *
 * @group Types
 */
export type AbstractConstructable<T> = abstract new (...args: any[]) => T;

/**
 * An anchor as written to state.
 *
 * @group Types
 */
export type AnchorSerializedOutput = {
  anchorId: string;
  parent: { context: string; type: `${NodeType}` };
  properties: { [key: string]: unknown };
};

/**
 * The model graph as written to `models.json`.
 * * `modules` record inputs before references resolve.
 *
 * @group Types
 */
export type ModelSerializedOutput = {
  anchors: (AnchorSerializedOutput & { className: string; location: { context: string; type: `${NodeType}` } })[];
  dependencies: IDependency[];
  models: { [context: string]: { className: string; model: { [key: string]: unknown }; moduleId: string } };
  modules: { [moduleId: string]: { className: string; inputs: { [key: string]: unknown } } };
  overlays: {
    className: string;
    context: string;
    moduleId: string;
    overlay: { anchors: AnchorSerializedOutput[]; overlayId: string; properties: { [key: string]: unknown } };
  }[];
};

/**
 * A resource as written to state.
 * * `parentSchemaTranslator` is the source of the function a child reads that parent through.
 *
 * @group Types
 */
export type ResourceSerializedSchema = {
  localResourceId: string;
  parents: { context: string; parentSchemaTranslator?: string }[];
  properties: { [key: string]: unknown };
  resourceId: string;
  response: { [key: string]: string };
  scope: string[];
  tags: { [key: string]: string };
};

/**
 * The resource graph as written to `resources-actual.json` and `resources-old.json`.
 * * `createdBy` is the context of the model or overlay whose action created the resource.
 * * `models` record the context of every model and overlay whose action produced the resource.
 *
 * @group Types
 */
export type ResourceSerializedOutput = {
  dependencies: IDependency[];
  resources: {
    [context: string]: {
      className: string;
      createdBy?: string;
      kind: 'external' | 'terraform';
      models: string[];
      moduleId: string;
      resource: ResourceSerializedSchema;
    };
  };
};

/**
 * A record of one generated terraform module folder, kept in state so that a later run can tell
 * which folders it owns.
 *
 * @group Types
 */
export type TerraformFolderOutput = {
  hasExternalResources: boolean;
  moduleId: string;
  /**
   * The resources whose terraform state moves into this folder from another before terraform runs,
   * each with the addresses and output names it moves from and to.
   */
  moves?: {
    addresses: { from: string; to: string }[];
    fromModuleId: string;
    outputs: { from: string; to: string }[];
    resourceId: string;
  }[];
  providers: {
    accountId: string;
    blockHcl: string;
    providerType: string;
    regionId: string;
    requiredProvider: { minVersion?: string; source: string };
  }[];
};

/**
 * A record of where one octo resource ended up in terraform, kept in state so that a plan entry can
 * be traced back to the resource that produced it.
 *
 * @group Types
 */
export type TerraformResourceOutput = {
  /**
   * Set when destroying the resource loses data, as its class declares.
   */
  destroyLosesData?: true;
  moduleId: string;
  resourceContext: string;
  resourceId: string;
  terraformAddresses: string[];
};

/**
 * @internal
 */
export type TransactionOptions = {
  enableResourceValidation?: boolean;
  filterResourceDiffsByResourceId?: string;
  generateTerraform?: boolean;
  skipActualResourceUpdate?: boolean;
  yieldModelDiffs?: boolean;
  yieldModelTransaction?: boolean;
  yieldResourceDiffs?: boolean;
  yieldResourceTransaction?: boolean;
};

/**
 * The schema of an anchor class.
 *
 * @group Types
 */
export type AnchorSchema<T> = T extends AAnchor<infer S, any> ? S : never;

/**
 * Everything an action knows about the module it belongs to: the inputs it was loaded with, whatever
 * {@link AModule.registerMetadata} derived, and the nodes the module produced.
 *
 * This is the second argument of {@link IModelAction.handle}.
 *
 * @group Types
 */
export type EnhancedModuleSchema<T extends UnknownModule> = {
  inputs: { [K in keyof ModuleSchemaInputs<T>]: ModuleSchema<T>[K] };
  metadata: Awaited<ReturnType<T['registerMetadata']>>;
  models: Record<string, UnknownModel>;
  overlays: Record<string, UnknownOverlay>;
  resources: Record<string, UnknownResource>;
};

/**
 * @internal
 */
export type GeneratorYieldType<T extends (...args: any) => AsyncGenerator<any>> =
  ReturnType<T> extends AsyncGenerator<infer Y> ? Y : never;

/**
 * @internal
 */
export type ModelSchema<T> = T extends AModel<infer S, any> ? S : never;

/**
 * The schema of a module class.
 *
 * @group Types
 */
export type ModuleSchema<T> = T extends AModule<infer S, any> ? S : never;

/**
 * A module's schema as the caller supplies it - properties with a default become optional.
 * This is the shape {@link Octo.loadModule} accepts.
 *
 * @group Types
 */
export type ModuleSchemaInputs<T> = { [K in ClassRequiredProperties<ModuleSchema<T>>]: ModuleSchema<T>[K] } & {
  [K in ClassOptionalProperties<ModuleSchema<T>>]?: ModuleSchema<T>[K];
};

/**
 * @internal
 */
export type NodeSchema<T> = T extends ANode<infer S, any> ? S : never;

/**
 * The schema of an overlay class.
 *
 * @group Types
 */
export type OverlaySchema<T> = T extends AOverlay<infer S, any> ? S : never;

/**
 * The schema of a resource class.
 *
 * @group Types
 */
export type ResourceSchema<T> = T extends AResource<infer S, any> ? S : never;

/**
 * @internal
 */
export type IUnknownModel = IModel<unknown, any>;

/**
 * @internal
 */
export type IUnknownModelAction = IModelAction<any>;

/**
 * @internal
 */
export type IUnknownResourceAction = IResourceAction<any>;

/**
 * @internal
 */
export type UnknownAnchor = AAnchor<BaseAnchorSchema, UnknownModel>;

/**
 * @internal
 */
export type UnknownModel = AModel<unknown, any>;

/**
 * @internal
 */
export type UnknownModule = AModule<unknown, any>;

/**
 * @internal
 */
export type UnknownNode = ANode<unknown, unknown>;

/**
 * @internal
 */
export type UnknownOverlay = AOverlay<BaseOverlaySchema, any>;

/**
 * @internal
 */
export type UnknownResource = AResource<any, any>;
