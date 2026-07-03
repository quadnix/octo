import {
  type Constructable,
  MatchingResource,
  type ResourceSchema,
  type TerraformFolderOutput,
  type UnknownResource,
} from '../../app.type.js';
import { Factory } from '../../decorators/factory.decorator.js';
import { getSchemaDefaults } from '../../functions/schema/schema.js';
import type { BaseResourceSchema } from '../../resources/resource.schema.js';
import { StringUtility } from '../../utilities/string/string.utility.js';
import {
  ExpressionHclNode,
  HclExpression,
  InterpolatedStringHclNode,
  JsonEncodeHclNode,
  LiteralHclNode,
  MapHclNode,
  MapHclNodeRaw,
  RefHclNode,
  type RenderContext,
  TerraformBlock,
  TerraformData,
  type TerraformLiteralType,
  TerraformOutput,
  TerraformResource,
  TerraformVariable,
  TypeHclNode,
  toHclNode,
} from './terraform.type.js';

/**
 * Mapping of an octo resource to terraform. It is used during:
 * - Validation: (octo diff <-> TF plan comparison).
 * - Commit (tfstate outputs -> response population).
 */
interface OctoTerraformResourceMapping {
  /**
   * The terragrunt folder this octo resource lives in (one folder per octo module).
   */
  moduleId: string;

  /**
   * Per response key, and the name of the output it is published under.
   * Empty array for external resources (see {@link entireResponseOutput}).
   */
  outputMappings: { key: string; outputName: string }[];

  /**
   * Set for external resources only: the single output carrying the entire response map.
   */
  entireResponseOutput?: string;

  /**
   * The octo resource context, used during validate to match a TF plan entry back to its octo resource.
   */
  resourceContext: string;

  /**
   * The octo resource's unique id, used to look it up in the registry.
   */
  resourceId: string;

  /**
   * The addresses of every TerraformResource block generated for this octo resource.
   * Used during validate to check the TF plan covers them all.
   */
  terraformAddresses: string[];
}

export interface OctoTerraformResourceScope<
  TResponse extends BaseResourceSchema['response'] = BaseResourceSchema['response'],
> {
  /**
   * Emits one `resource "<type>" "<name>"` block for this octo resource.
   * Multiple calls chain via `depends_on` in call order.
   * The provider alias is applied automatically when the resource was registered with a provider context.
   */
  addTerraformResource(type: string, name: string, spec?: Record<string, unknown>): TerraformResource;

  /**
   * Declares the outputs for this resource — one entry per response key.
   * Every response key must be declared; the commit phase reads exactly these outputs to
   * reconstruct the full response.
   */
  output(
    outputs: Record<keyof TResponse & string, unknown>,
    options?: { sensitiveKeys?: (keyof TResponse & string)[] },
  ): void;
}

interface TerraformModuleFiles {
  mainTf: string;
  outputsTf: string;
  terragruntHcl: string;
  variablesTf: string;
}

export interface TerraformModuleScope {
  readonly moduleId: string;

  /**
   * Wraps an octo resource whose lifecycle runs outside Terraform (e.g. a script or SDK call).
   * Generates a `null_resource` + `data "external"` pair that calls `octo run-action`
   * at apply time and exposes the result as outputs.
   */
  addOctoTerraformExternalResource<T extends UnknownResource>(
    octoResource: T,
  ): OctoTerraformResourceScope<ResourceSchema<T>['response']>;

  /**
   * Registers an octo resource as a native Terraform resource. Returns an
   * {@link OctoTerraformResourceScope} on which you call `addTerraformResource()` to emit
   * HCL blocks and `output()` to declare what other resources can reference.
   *
   * - Pass `options.explicitParents` for dependencies that aren't captured by attribute references alone.
   * - Pass `options.provider` to pin the resource to a specific account/region provider.
   */
  addOctoTerraformResource<T extends UnknownResource>(
    octoResource: T,
    options?: {
      explicitParents?: (UnknownResource | MatchingResource<BaseResourceSchema>)[];
      provider?: TerraformProviderContext;
    },
  ): OctoTerraformResourceScope<ResourceSchema<T>['response']>;

  /**
   * Emits a `data "<type>" "<name>"` block. Use for read-only data sources that look
   * up existing infrastructure (e.g. `aws_ami`, `aws_caller_identity`).
   */
  addTerraformData(type: string, name: string, spec?: Record<string, unknown>): TerraformData;

  /**
   * Returns the `<providerType>.<alias>` expression for a registered provider.
   * Pass the result as the `provider` attribute when a resource must target a
   * specific account/region different from the module's default.
   */
  getProviderAliasRef(accountId: string, regionId?: string): HclExpression;

  /**
   * Returns a reference to another resource's output that resolves correctly at
   * render time: an inline TF expression when the producer is in the same module,
   * or a `var.*` wired through terragrunt when it is in a different module.
   */
  getRef<T extends UnknownResource>(resource: T, key: keyof ResourceSchema<T>['response'] & string): HclExpression;
  getRef<S extends BaseResourceSchema>(resource: MatchingResource<S>, key: keyof S['response'] & string): HclExpression;

  /**
   * Wraps a value in a `jsonencode(...)` call.
   */
  jsonencode(subject: object | unknown[]): HclExpression;

  /**
   * Use `mapAttr()` when the provider schema defines a **map/object attribute** (`key = { }`).
   * Use a plain JS object in the resource spec when the schema expects a **block** (`key { }`).
   * The distinction matters: blocks have no `=`. Check the provider docs for each argument.
   */
  mapAttr(value: Record<string, unknown>): HclExpression;

  /**
   * Emits a value verbatim as a terraform expression (no quoting).
   */
  raw(value: unknown): HclExpression;

  /**
   * Returns a terraform `type(...)` expression for use in `variable` declarations.
   */
  type(schema: unknown): HclExpression;

  /**
   * Declares a user-supplied input variable for this module. Use when a value must
   * be provided at apply time rather than derived from another resource's output.
   */
  variable(
    name: string,
    typeExpression: unknown,
    options: { default: TerraformLiteralType; sensitive: boolean },
  ): TerraformVariable;
}

/**
 * One external resource whose parent-input wiring (triggers + `local-exec` commands) is deferred
 * until every resource is registered. Recorded when the resource's shell is created by
 * {@link TerraformService.addOctoTerraformExternalResource}, consumed by
 * {@link TerraformService.wireExternalResourceInputs}.
 */
interface PendingExternalResourceInputWiring {
  name: string;
  nullResource: TerraformResource;
  octoResource: UnknownResource;
  resourceId: string;
}

/**
 * Per-module result of the wiring phase ({@link TerraformService.computeWiring}), consumed by the render phase.
 */
interface TerraformModuleWiring {
  /**
   * Cross-module refs only. Maps the generated variable name to the producer folder and output
   * it must be wired from. Drives `variables.tf` declarations and `terragrunt.hcl` inputs.
   *
   * `objectKeys` is set only for external producers, whose single auto variable carries the
   * producer's **entire response object** (consumed as `var.<name>.<key>`); it lists the keys
   * actually accessed so `terragrunt.hcl` can mock the output as an object rather than a flat
   * string. Normal (per-key scalar) producers leave it undefined.
   */
  autoVariables: Map<
    string,
    {
      objectKeys?: Set<string>;
      outputName: string;
      producerModuleId: string;
      producerResourceId: string;
      responseKey?: string;
    }
  >;

  /**
   * Producer folders this module's `terragrunt.hcl` must declare `dependency` blocks for,
   * mapped to the refs/explicit parents that created each edge (named in cycle errors).
   */
  moduleDependencies: Map<string, Set<string>>;

  /**
   * Same-module `depends_on` addresses per resource, derived from explicit parents.
   * Cross-module explicit parents are covered by {@link moduleDependencies} instead.
   */
  parentDependsOn: Map<OctoTerraformResource, string[]>;

  /**
   * All refs (same-module and cross-module). Maps `<resourceId>.<key>` to the final HCL
   * string to emit: an inline TF expression for same-module, or `var.*` for cross-module.
   */
  resolvedRefs: Map<string, string>;
}

/**
 * Every terraform resource requires a deployment target - which provider, account, and region to make the call to.
 * This deployment target is automatically derived using accountId and regionId,
 * rather than developers hard-coding the provider alias.
 */
interface TerraformProviderContext {
  accountId: string;
  regionId?: string;
}

/**
 * Expands an author-provided spec object into attributes and blocks on `target`:
 */
function addTerraformResourceSpec(
  target: TerraformBlock | TerraformData | TerraformResource,
  spec: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(spec)) {
    if (value instanceof HclExpression) {
      target.attribute(key, value);
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      addTerraformResourceSpec(target.block(key), value as Record<string, unknown>);
    } else if (
      Array.isArray(value) &&
      value!.every((v) => v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof HclExpression))
    ) {
      for (const item of value) {
        addTerraformResourceSpec(target.block(key), item as Record<string, unknown>);
      }
    } else {
      target.attribute(key, value);
    }
  }
}

/**
 * Full implementation of {@link OctoTerraformResourceScope}. Holds all the internal state
 * that {@link TerraformService} reads during the wiring and render phases.
 *
 * The `outputs` map is the resource's answer sheet:
 * - key is the resource's response key that other resources use for referencing.
 * - name is the `${resourceId}-${key}` output name it is published under.
 * - value is the terraform expression that produces the value.
 */
class OctoTerraformResource<TResponse extends BaseResourceSchema['response'] = BaseResourceSchema['response']>
  implements OctoTerraformResourceScope<TResponse>
{
  readonly outputs: Map<string, { name: string; sensitive: boolean; value: HclExpression }> = new Map();
  readonly terraformResources: TerraformResource[] = [];

  constructor(
    readonly resourceId: string,
    readonly resourceContext: string,
    readonly moduleId: string,
    readonly explicitParentResourceIds: string[] = [],
    private readonly providerRef?: string, // Fully-qualified provider reference (`aws._111111111-us-east-1`).
    readonly externalResultExpression?: string, // External resource marker with `data.external.<name>.result` value.
    readonly responseDefaults: BaseResourceSchema['response'] = {}, // Resource schema's *declared* response defaults.
  ) {
    // When an external script, publish the whole-result map as one output, keyed only by resource id, no output key.
    if (externalResultExpression !== undefined) {
      this.outputs.set(resourceId, {
        name: StringUtility.sanitizeForIdentifier(resourceId),
        sensitive: false,
        value: new ExpressionHclNode(externalResultExpression),
      });
    }
  }

  addTerraformResource(type: string, name: string, spec: Record<string, unknown> = {}): TerraformResource {
    const intraResourceDependencies =
      this.terraformResources.length === 0 ? [] : [this.terraformResources[this.terraformResources.length - 1].address];

    const terraformResource = new TerraformResource(
      type,
      StringUtility.sanitizeForIdentifier(name),
      intraResourceDependencies,
    );
    if (this.providerRef && !('provider' in spec)) {
      terraformResource.attribute('provider', new ExpressionHclNode(this.providerRef));
    }
    addTerraformResourceSpec(terraformResource, spec);

    this.terraformResources.push(terraformResource);
    return terraformResource;
  }

  collectRefs(into: RefHclNode[]): void {
    this.terraformResources.forEach((r) => r.collectRefs(into));
    this.outputs.forEach((o) => o.value.collectRefs(into));
  }

  output(
    outputs: Record<keyof TResponse & string, unknown>,
    options: { sensitiveKeys?: (keyof TResponse & string)[] } = {},
  ): void {
    const sensitiveKeys = new Set<string>(options.sensitiveKeys ?? []);
    for (const [key, value] of Object.entries(outputs)) {
      this.outputs.set(key, {
        name: StringUtility.sanitizeForIdentifier(`${this.resourceId}-${key}`),
        sensitive: sensitiveKeys.has(key),
        value: toHclNode(value),
      });
    }
  }
}

/**
 * Everything that renders into one terragrunt module folder.
 */
class TerraformModule {
  readonly dataSources: TerraformData[] = [];
  hasExternalResources: boolean = false; // True when folder has external resources requiring null/external configs.
  readonly providerKeys: Set<string> = new Set(); // Specific providers this folder's resources require.
  readonly resources: OctoTerraformResource[] = [];
  readonly variables: TerraformVariable[] = [];

  constructor(readonly moduleId: string) {}
}

export class TerraformService {
  private minTerraformVersion: string = '1.6.0';
  private readonly modules: Map<string, TerraformModule> = new Map();
  private readonly pendingExternalResourcesInputWiring: PendingExternalResourceInputWiring[] = [];
  private readonly providers: Map<
    string,
    { accountId: string; alias: string; block: TerraformBlock; providerType: string; regionId: string }
  > = new Map(); // TF provider blocks.
  private requiredProviders: Record<string, { minVersion?: string; source: string }> = {}; // TF config block.
  private readonly resourceRegistry: Map<string, OctoTerraformResource> = new Map();
  private readonly sanitizedResourceIds: Map<string, string> = new Map(); // Sanitized id -> original id.

  constructor(
    private readonly runOctoResourceActionCommandPrefix: string = 'octo run-action',
    private readonly indentLength: number = 2,
  ) {}

  /**
   * Generates the `null_resource` + `data "external"` wrapper for an external resource.
   *
   * Only the parts that depend on no other resource are built here:
   * - the `null_resource` shell (its triggers and `local-exec` provisioners are filled in later),
   * - the `data "external"` read of `.octo-outputs/<id>.json`, deferred to apply time via `depends_on`,
   * - the single whole-result output (`data.external.<name>.result`) that carries the entire response.
   *
   * The external resource is never enumerated per response key: its response shape is unknown at
   * generation time (the action has not run) and is, by the `data "external"` protocol, a flat map of
   * strings. Refs to it (`getRef`) resolve by indexing this one expression; commit reads the whole map back.
   *
   * The parent-input wiring (triggers + create/destroy commands) reads every parent's outputs, which
   * only all exist once registration is complete. It is therefore deferred to
   * {@link wireExternalResourceInputs} (run at the start of {@link computeWiring}). This deferral is
   * what lets the generate sweep contribute resources in any order, rather than parents-first.
   */
  private addOctoTerraformExternalResource<T extends UnknownResource>(
    moduleId: string,
    octoResource: T,
  ): OctoTerraformResourceScope<ResourceSchema<T>['response']> {
    const resourceId = octoResource.resourceId;
    const name = StringUtility.sanitizeForIdentifier(resourceId);

    const parents: UnknownResource[] = (octoResource.parents || []).map((p) =>
      p instanceof MatchingResource ? p.getActual() : p,
    );

    const octoTerraformResource = this.addOctoTerraformResource(moduleId, octoResource, {
      explicitParents: parents,
      externalResultExpression: `data.external.${name}.result`,
    });
    this.module(moduleId).hasExternalResources = true;

    // The null_resource shell. Its triggers and provisioner are added by wireExternalResourceInputs(),
    // once every parent's outputs are known.
    const nullResource = octoTerraformResource.addTerraformResource('null_resource', name);

    const outputsFile = `\${path.module}/.octo-outputs/${name}.json`;
    const dataExternal = this.addTerraformData(moduleId, 'external', name, {
      program: ['cat', new ExpressionHclNode(`"${outputsFile}"`)],
    });
    dataExternal.attribute('depends_on', new ExpressionHclNode(`[null_resource.${name}]`));

    this.pendingExternalResourcesInputWiring.push({ name, nullResource, octoResource, resourceId });

    return octoTerraformResource;
  }

  private addOctoTerraformResource<T extends UnknownResource>(
    moduleId: string,
    octoResource: T,
    options: {
      explicitParents?: (UnknownResource | MatchingResource<BaseResourceSchema>)[];
      externalResultExpression?: string;
      provider?: TerraformProviderContext;
    } = {},
  ): OctoTerraformResource<ResourceSchema<T>['response']> {
    const explicitParentResourceIds = (options.explicitParents || []).map((p) =>
      p instanceof MatchingResource ? p.getSchemaInstanceInResourceAction().resourceId : p.resourceId,
    );

    // Distinct resource ids must stay distinct after sanitization, or else the generated output names,
    // identifiers, and variable names would silently collide. Environment-variable sanitization
    // merges strictly more characters than identifier sanitization, so this one check covers both.
    const sanitizedResourceId = StringUtility.sanitizeForEnvironmentVariable(octoResource.resourceId);
    const existingResourceId = this.sanitizedResourceIds.get(sanitizedResourceId);
    if (existingResourceId !== undefined) {
      if (existingResourceId === octoResource.resourceId) {
        throw new Error(`Resource id "${octoResource.resourceId}" is already registered!`);
      }
      throw new Error(
        `Resource id "${octoResource.resourceId}" collides with resource id "${existingResourceId}" after sanitization!`,
      );
    }
    this.sanitizedResourceIds.set(sanitizedResourceId, octoResource.resourceId);

    const module = this.module(moduleId);

    let providerRef: string | undefined;
    if (options.provider) {
      const { alias, key, providerType } = this.findProvider(options.provider.accountId, options.provider.regionId);
      providerRef = `${providerType}.${alias}`;
      module.providerKeys.add(key);
    }

    // Seed mock outputs from the producer schema's declared response defaults — never the live
    // response — so a regenerate after a commit cannot inline real (possibly secret) applied values.
    // Test resources carry a non-constructable NODE_SCHEMA; they fall back to synthetic placeholders.
    const schemaClass = (octoResource.constructor as unknown as { NODE_SCHEMA?: Constructable<BaseResourceSchema> })
      .NODE_SCHEMA;
    const responseDefaults: BaseResourceSchema['response'] =
      typeof schemaClass === 'function' ? (getSchemaDefaults(schemaClass).response ?? {}) : {};

    const newResource = new OctoTerraformResource<ResourceSchema<T>['response']>(
      octoResource.resourceId,
      octoResource.getContext(),
      moduleId,
      explicitParentResourceIds,
      providerRef,
      options.externalResultExpression,
      responseDefaults,
    );
    module.resources.push(newResource);
    this.resourceRegistry.set(octoResource.resourceId, newResource);
    return newResource;
  }

  /**
   * Sets the minimum terraform version and the `required_providers` sources/versions that render
   * into every folder's config block (scoped to the providers each folder actually uses).
   */
  addTerraformConfig({
    minTerraformVersion = '1.6.0',
    providers = {},
  }: {
    minTerraformVersion?: string;
    providers?: Record<string, { minVersion?: string; source: string }>;
  } = {}): void {
    this.minTerraformVersion = minTerraformVersion;
    this.requiredProviders = { ...this.requiredProviders, ...providers };
  }

  /**
   * Registers a Terraform provider block for the given provider type, account, and region.
   *
   * @param providerType - The terraform provider type, e.g. `aws`, `google`.
   * @param accountId - The account/project/subscription ID.
   * @param regionId - The region ID.
   * @param spec - Provider arguments beyond `alias` and `region`.
   *   - Primitives become attributes (`key = value`).
   *   - Plain objects become blocks (`key { }`).
   *   - Wrap with `mapAttr()` when the provider schema expects a map attribute (`key = { }`).
   * @param options - optional provider configurations.
   *   - options.setRegionAttribute - Set to false for providers that do not accept a `region`
   *   argument on the provider block (e.g. azure).
   */
  addTerraformProvider(
    providerType: string,
    accountId: string,
    regionId: string,
    spec: Record<string, unknown> = {},
    { setRegionAttribute = true }: { setRegionAttribute?: boolean } = {},
  ): void {
    if (!(providerType in this.requiredProviders)) {
      throw new Error(
        `Provider type "${providerType}" is not configured! Call registerTerraformConfig() with a "${providerType}" entry before registering providers.`,
      );
    }

    // Terraform identifiers (here, the provider alias) must start with a letter or underscore.
    const sanitizedAlias = StringUtility.sanitizeForIdentifier(`${accountId}-${regionId}`);
    const alias = /^[0-9]/.test(sanitizedAlias) ? `_${sanitizedAlias}` : sanitizedAlias;
    const key = this.providerKey(providerType, accountId, regionId);

    if (!this.providers.has(key)) {
      const block = new TerraformBlock(`provider "${providerType}"`);
      block.attribute('alias', alias);
      if (setRegionAttribute) {
        block.attribute('region', regionId);
      }
      addTerraformResourceSpec(block, spec);
      this.providers.set(key, { accountId, alias, block, providerType, regionId });
    }
  }

  private addTerraformData(
    moduleId: string,
    type: string,
    name: string,
    spec: Record<string, unknown> = {},
  ): TerraformData {
    const dataSource = new TerraformData(type, StringUtility.sanitizeForIdentifier(name));
    addTerraformResourceSpec(dataSource, spec);
    this.module(moduleId).dataSources.push(dataSource);
    return dataSource;
  }

  /**
   * Phase 1 of rendering: resolve every {@link RefHclNode} and compute each folder's wiring.
   *
   * For every folder: collect all refs made from it, then resolve each one —
   * - producer in the same folder → the inline terraform expression,
   * - producer in another folder → a `var.*` name, plus three recorded consequences: declare the
   *   variable, depend on the producer's folder, wire the input in terragrunt.hcl.
   *
   * Explicit parents resolve similarly: same folder → `depends_on` addresses; other folder → a
   * terragrunt dependency. All ref errors and cross-folder cycles surface here — phase 2 cannot
   * fail.
   */
  private computeWiring(): Map<string, TerraformModuleWiring> {
    // Resolve deferred external-resource input wiring before collecting refs, so the triggers and
    // commands it produces are part of this pass.
    this.wireExternalResourceInputs();

    const wiring = new Map<string, TerraformModuleWiring>();
    const wiringOf = (moduleId: string): TerraformModuleWiring => {
      if (!wiring.has(moduleId)) {
        wiring.set(moduleId, {
          autoVariables: new Map(),
          moduleDependencies: new Map(),
          parentDependsOn: new Map(),
          resolvedRefs: new Map(),
        });
      }
      return wiring.get(moduleId)!;
    };
    const addModuleDependency = (
      moduleWiring: TerraformModuleWiring,
      producerModuleId: string,
      reason: string,
    ): void => {
      if (!moduleWiring.moduleDependencies.has(producerModuleId)) {
        moduleWiring.moduleDependencies.set(producerModuleId, new Set());
      }
      moduleWiring.moduleDependencies.get(producerModuleId)!.add(reason);
    };

    // Producer output expressions render without a consumer context; a ref inside an output
    // expression would require recursive resolution and is not supported.
    const renderInlineContext: RenderContext = {
      resolveRef: () => {
        throw new Error('Nested resource references are not supported in output expressions!');
      },
      step: this.step,
    };

    for (const module of this.modules.values()) {
      const moduleWiring = wiringOf(module.moduleId);

      // Collect every reference made from this module.
      const refs: RefHclNode[] = [];
      module.resources.forEach((r) => r.collectRefs(refs));
      module.dataSources.forEach((d) => d.collectRefs(refs));
      module.variables.forEach((v) => v.collectRefs(refs));

      for (const ref of refs) {
        const producer = this.resourceRegistry.get(ref.resourceId);
        if (!producer) {
          throw new Error(`Resource "${ref.resourceId}" not found in Octo Terraform!`);
        }

        if (producer.externalResultExpression !== undefined) {
          if (producer.moduleId === module.moduleId) {
            moduleWiring.resolvedRefs.set(
              `${ref.resourceId}.${ref.key}`,
              ref.entireResponse
                ? producer.externalResultExpression
                : `${producer.externalResultExpression}.${ref.key}`,
            );
          } else {
            const variableName = StringUtility.sanitizeForEnvironmentVariable(ref.resourceId);
            const entireResponseOutput = producer.outputs.get(producer.resourceId)!;

            // The variable holds the producer's entire response object; collect the keys consumed
            // across all refs so the mock can be shaped as an object (see `objectKeys`).
            const objectKeys = moduleWiring.autoVariables.get(variableName)?.objectKeys ?? new Set<string>();
            if (!ref.entireResponse) {
              objectKeys.add(ref.key);
            }

            moduleWiring.autoVariables.set(variableName, {
              objectKeys,
              outputName: entireResponseOutput.name,
              producerModuleId: producer.moduleId,
              producerResourceId: producer.resourceId,
            });
            addModuleDependency(moduleWiring, producer.moduleId, `ref "${ref.resourceId}.${ref.key}"`);
            moduleWiring.resolvedRefs.set(
              `${ref.resourceId}.${ref.key}`,
              ref.entireResponse ? `var.${variableName}` : `var.${variableName}.${ref.key}`,
            );
          }
          continue;
        }

        const output = producer.outputs.get(ref.key);
        if (!output) {
          throw new Error(`Ref "${ref.key}" not registered for resource "${ref.resourceId}" in Octo Terraform!`);
        }

        if (producer.moduleId === module.moduleId) {
          moduleWiring.resolvedRefs.set(`${ref.resourceId}.${ref.key}`, output.value.render('', renderInlineContext));
        } else {
          const variableName = StringUtility.sanitizeForEnvironmentVariable(`${ref.resourceId}_${ref.key}`);
          const existingVariable = moduleWiring.autoVariables.get(variableName);
          if (existingVariable && existingVariable.outputName !== output.name) {
            throw new Error(
              `Variable "${variableName}" maps to both outputs "${existingVariable.outputName}" and ` +
                `"${output.name}"! Rename one of the resources or response keys.`,
            );
          }
          moduleWiring.autoVariables.set(variableName, {
            outputName: output.name,
            producerModuleId: producer.moduleId,
            producerResourceId: producer.resourceId,
            responseKey: ref.key,
          });
          addModuleDependency(moduleWiring, producer.moduleId, `ref "${ref.resourceId}.${ref.key}"`);
          moduleWiring.resolvedRefs.set(`${ref.resourceId}.${ref.key}`, `var.${variableName}`);
        }
      }

      // Explicit parents: same module → depends_on; cross module → terragrunt ordering.
      for (const resource of module.resources) {
        const addresses: string[] = [];
        for (const parentResourceId of resource.explicitParentResourceIds) {
          const parent = this.resourceRegistry.get(parentResourceId);
          if (!parent) {
            throw new Error(
              `Explicit parent "${parentResourceId}" of resource "${resource.resourceId}" is not registered in Terraform!`,
            );
          }
          if (parent.moduleId === module.moduleId) {
            addresses.push(...parent.terraformResources.map((t) => t.address));
          } else {
            addModuleDependency(
              moduleWiring,
              parent.moduleId,
              `parent "${parentResourceId}" of "${resource.resourceId}"`,
            );
          }
        }
        moduleWiring.parentDependsOn.set(resource, addresses);
      }
    }

    this.detectModuleCycles(wiring);
    return wiring;
  }

  /**
   * Depth-first search over folder dependencies; throws on the first cycle, naming its path and
   * the refs/explicit parents forming each edge.
   */
  private detectModuleCycles(wiring: Map<string, TerraformModuleWiring>): void {
    const visited = new Set<string>();
    const inStack = new Set<string>();

    const visit = (moduleId: string, path: string[]): void => {
      if (inStack.has(moduleId)) {
        const cycleStart = path.indexOf(moduleId);
        const cycle = [...path.slice(cycleStart), moduleId];
        const edges = cycle.slice(0, -1).map((from, i) => {
          const to = cycle[i + 1];
          const reasons = [...(wiring.get(from)?.moduleDependencies.get(to) ?? [])];
          return `"${from}" -> "${to}" via ${reasons.join(', ')}`;
        });
        throw new Error(`Found cross-module dependency cycle: ${cycle.join(' -> ')}! Edges: ${edges.join('; ')}.`);
      }
      if (visited.has(moduleId)) {
        return;
      }

      inStack.add(moduleId);
      for (const dependency of wiring.get(moduleId)?.moduleDependencies.keys() ?? []) {
        visit(dependency, [...path, moduleId]);
      }
      inStack.delete(moduleId);
      visited.add(moduleId);
    };

    for (const moduleId of wiring.keys()) {
      visit(moduleId, []);
    }
  }

  /**
   * Derives the registered provider for a deployment target using only `accountId` (+ `regionId`).
   * The provider type was decided during provider registration.
   *
   * Without a `regionId` (global resources), any provider of the account matches — the first
   * registered wins, since the alias only routes the region.
   */
  private findProvider(accountId: string, regionId?: string): { alias: string; key: string; providerType: string } {
    const matches = [...this.providers.entries()].filter(
      ([, p]) => p.accountId === accountId && (regionId === undefined || p.regionId === regionId),
    );

    const target =
      regionId === undefined ? `account "${accountId}"` : `account "${accountId}" and region "${regionId}"`;
    if (matches.length === 0) {
      throw new Error(`No provider registered for ${target}!`);
    }

    const providerTypes = new Set(matches.map(([, p]) => p.providerType));
    if (regionId !== undefined && providerTypes.size > 1) {
      throw new Error(`Multiple providers registered for ${target}! Cannot derive a unique provider.`);
    }

    const [key, provider] = matches[0];
    return { alias: provider.alias, key, providerType: provider.providerType };
  }

  /**
   * Returns the folder record of the current sweep: one entry per folder-bearing module — a
   * preloaded shell the sweep left empty is an emptied folder, not folder-bearing, so it drops out
   * of the record. Call after the sweep has contributed every resource (the same point
   * {@link renderAllModules} is valid).
   */
  getFolderRecords(): TerraformFolderOutput[] {
    // Provider blocks are registration-time constants; a resource reference inside one is invalid.
    const context: RenderContext = {
      resolveRef: () => {
        throw new Error('Resource references are not supported in provider blocks!');
      },
      step: this.step,
    };

    return [...this.modules.values()]
      .filter((module) => module.resources.length > 0)
      .map((module) => ({
        hasExternalResources: module.hasExternalResources,
        moduleId: module.moduleId,
        providers: [...module.providerKeys].sort().map((key) => {
          const provider = this.providers.get(key)!;
          return {
            accountId: provider.accountId,
            blockHcl: provider.block.render('', context),
            providerType: provider.providerType,
            regionId: provider.regionId,
            requiredProvider: this.requiredProviders[provider.providerType],
          };
        }),
      }));
  }

  getModuleIds(): string[] {
    return [...this.modules.keys()];
  }

  private getProviderAliasRef(moduleId: string, accountId: string, regionId?: string): HclExpression {
    const { alias, key, providerType } = this.findProvider(accountId, regionId);
    this.module(moduleId).providerKeys.add(key);
    return new ExpressionHclNode(`${providerType}.${alias}`);
  }

  private getRef<T extends UnknownResource>(
    resource: T,
    key: keyof ResourceSchema<T>['response'] & string,
  ): HclExpression;
  private getRef<S extends BaseResourceSchema>(
    resource: MatchingResource<S>,
    key: keyof S['response'] & string,
  ): HclExpression;
  private getRef(resource: UnknownResource | MatchingResource<any>, key: string): HclExpression {
    const resourceId =
      resource instanceof MatchingResource
        ? resource.getSchemaInstanceInResourceAction().resourceId
        : resource.resourceId;
    return new RefHclNode(resourceId, key);
  }

  /**
   * Resource→resource value-reference edges, keyed by the referenced (producer) resourceId → the set
   * of resourceIds that reference it. Edges follow `getRef` value references only — the same graph
   * terraform cascades replacement along (force-new). `depends_on`/explicit parents are excluded:
   * an ordering edge carries no value and does not force a dependent's replacement.
   *
   * Used by validate to attribute terraform's transitive replacement cascade: when octo replaces a
   * resource, terraform recreates everything that (transitively) references it, so those changes are
   * expected rather than unattributed.
   */
  getResourceReferrers(): Map<string, Set<string>> {
    const referrers = new Map<string, Set<string>>();
    const addEdge = (referentId: string, referrerId: string): void => {
      if (referentId === referrerId) {
        return;
      }
      if (!referrers.has(referentId)) {
        referrers.set(referentId, new Set());
      }
      referrers.get(referentId)!.add(referrerId);
    };

    for (const resource of this.resourceRegistry.values()) {
      const refs: RefHclNode[] = [];
      resource.collectRefs(refs);
      for (const ref of refs) {
        addEdge(ref.resourceId, resource.resourceId);
      }

      // An external resource consumes each parent's outputs as inputs — its null_resource triggers
      // embed the parent's values, so a parent replace recreates it. That is a true value edge, even
      // though it is recorded as an explicit parent (and its trigger refs are wired only at render
      // time, so they are not yet in `collectRefs` here).
      if (resource.externalResultExpression !== undefined) {
        for (const parentResourceId of resource.explicitParentResourceIds) {
          addEdge(parentResourceId, resource.resourceId);
        }
      }
    }
    return referrers;
  }

  getOctoTerraformResourceMappings(): OctoTerraformResourceMapping[] {
    return [...this.resourceRegistry.values()].map((r) => {
      const isExternal = r.externalResultExpression !== undefined;
      return {
        entireResponseOutput: isExternal ? r.outputs.get(r.resourceId)!.name : undefined,
        moduleId: r.moduleId,
        outputMappings: isExternal ? [] : [...r.outputs.entries()].map(([key, o]) => ({ key, outputName: o.name })),
        resourceContext: r.resourceContext,
        resourceId: r.resourceId,
        terraformAddresses: r.terraformResources.map((t) => t.address),
      };
    });
  }

  private jsonencode(subject: object | unknown[]): HclExpression {
    return new JsonEncodeHclNode(subject);
  }

  private mapAttr(value: Record<string, unknown>): HclExpression {
    return new MapHclNode(Object.entries(value).map(([k, v]) => [k, toHclNode(v)]));
  }

  private module(moduleId: string): TerraformModule {
    if (!this.modules.has(moduleId)) {
      this.modules.set(moduleId, new TerraformModule(moduleId));
    }
    return this.modules.get(moduleId)!;
  }

  private providerKey(providerType: string, accountId: string, regionId: string): string {
    return `${providerType}:${accountId}:${regionId}`;
  }

  private raw(value: unknown): HclExpression {
    return new ExpressionHclNode(String(value));
  }

  /**
   * Phase 2 of rendering: prints the four files of every folder from the wiring computed in
   * phase 1. Makes no decisions — when a {@link RefHclNode} renders, its answer is looked up in the
   * folder's precomputed `resolvedRefs`. Cross-folder dependency cycles throw (in phase 1).
   */
  renderAllModules(): Map<string, TerraformModuleFiles> {
    const wiring = this.computeWiring();

    const result = new Map<string, TerraformModuleFiles>();
    for (const module of this.modules.values()) {
      const moduleWiring = wiring.get(module.moduleId)!;
      const context: RenderContext = {
        resolveRef: (ref) => moduleWiring.resolvedRefs.get(`${ref.resourceId}.${ref.key}`)!,
        step: this.step,
      };

      // main.tf: terraform config, provider blocks, data sources, resources.
      const requiredProviders: Record<string, { minVersion?: string; source: string }> = {};
      for (const key of module.providerKeys) {
        const providerType = this.providers.get(key)!.providerType;
        requiredProviders[providerType] = this.requiredProviders[providerType];
      }
      if (module.hasExternalResources) {
        requiredProviders['null'] = this.requiredProviders['null'] ?? { source: 'hashicorp/null' };
        requiredProviders['external'] = this.requiredProviders['external'] ?? { source: 'hashicorp/external' };
      }

      const mainTf = [
        this.renderConfigBlock(requiredProviders, context),
        ...[...module.providerKeys].sort().map((key) => this.providers.get(key)!.block.render('', context)),
        ...module.dataSources.map((d) => d.render(context)),
        ...module.resources.map((r) =>
          r.terraformResources.map((t) => t.render(context, moduleWiring.parentDependsOn.get(r) ?? [])).join('\n\n'),
        ),
      ]
        .filter(Boolean)
        .join('\n\n');

      // variables.tf: auto variables from cross-module refs, then user variables. An external
      // producer's variable carries its entire response object (consumed as `var.<name>.<key>`), so it
      // must be typed `map(string)` — terraform's external-data contract — otherwise an un-typed variable
      // coerces the object to a JSON string and `var.<name>.<key>` fails at plan/apply. Per-key scalar
      // variables stay un-typed.
      const variablesTf = [
        ...[...moduleWiring.autoVariables.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, v]) =>
            v.objectKeys ? `variable "${name}" {\n${this.step}type = map(string)\n}` : `variable "${name}" {}`,
          ),
        ...module.variables.map((v) => v.render(context)),
      ]
        .filter(Boolean)
        .join('\n\n');

      // outputs.tf: every resource's declared outputs.
      const outputsTf = module.resources
        .map((r) =>
          [...r.outputs.values()]
            .map((o) => new TerraformOutput(o.name, o.value, o.sensitive).render(context))
            .join('\n\n'),
        )
        .filter(Boolean)
        .join('\n\n');

      const terragruntHcl = this.renderTerragrunt(moduleWiring);

      result.set(module.moduleId, {
        mainTf: mainTf + '\n',
        outputsTf: outputsTf ? outputsTf + '\n' : '',
        terragruntHcl: terragruntHcl + '\n',
        variablesTf: variablesTf ? variablesTf + '\n' : '',
      });
    }

    return result;
  }

  /**
   * Prints one folder's `terraform { required_version, required_providers }` config block.
   */
  private renderConfigBlock(
    requiredProviders: Record<string, { minVersion?: string; source: string }>,
    context: RenderContext,
  ): string {
    const configBlock = new TerraformBlock('terraform');
    configBlock.attribute('required_version', `>= ${this.minTerraformVersion}`);

    const providerTypes = Object.keys(requiredProviders).sort();
    if (providerTypes.length > 0) {
      const requiredProvidersBlock = configBlock.block('required_providers');
      for (const providerType of providerTypes) {
        const entry = requiredProviders[providerType];
        const lines = [`source = "${entry.source}"`];
        if (entry.minVersion) {
          lines.push(`version = ">= ${entry.minVersion}"`);
        }
        requiredProvidersBlock.attribute(providerType, new MapHclNodeRaw(lines));
      }
    }

    return configBlock.render('', context);
  }

  /**
   * Prints the four files of an **empty** folder from a recorded folder: a `main.tf` with the
   * config block rebuilt from the recorded `required_providers` entries (plus null/external when
   * the folder had external resources) and the recorded provider blocks verbatim; empty
   * variables/outputs; a remote_state-only `terragrunt.hcl`.
   *
   * Reads no module state;
   * the generate mode decides which folders are emptied and which recorded folder each renders from.
   */
  renderEmptyModule(record: TerraformFolderOutput): TerraformModuleFiles {
    const context: RenderContext = {
      resolveRef: () => {
        throw new Error('Resource references are not supported in emptied folders!');
      },
      step: this.step,
    };

    const requiredProviders: Record<string, { minVersion?: string; source: string }> = {};
    for (const provider of record.providers) {
      requiredProviders[provider.providerType] = provider.requiredProvider;
    }
    if (record.hasExternalResources) {
      requiredProviders['null'] = this.requiredProviders['null'] ?? { source: 'hashicorp/null' };
      requiredProviders['external'] = this.requiredProviders['external'] ?? { source: 'hashicorp/external' };
    }

    const mainTf = [this.renderConfigBlock(requiredProviders, context), ...record.providers.map((p) => p.blockHcl)]
      .filter(Boolean)
      .join('\n\n');

    return {
      mainTf: mainTf + '\n',
      outputsTf: '',
      terragruntHcl:
        this.renderTerragrunt({
          autoVariables: new Map(),
          moduleDependencies: new Map(),
          parentDependsOn: new Map(),
          resolvedRefs: new Map(),
        }) + '\n',
      variablesTf: '',
    };
  }

  /**
   * Prints one folder's `terragrunt.hcl`: a `dependency` block per producer folder (with
   * `mock_outputs` so `run-all plan` works before the first apply), and the `inputs` map wiring
   * each auto variable to the producer's output.
   */
  private renderTerragrunt(moduleWiring: TerraformModuleWiring): string {
    const step = this.step;
    const sections: string[] = [];

    // Pin the (local) backend state to a stable absolute path in the module folder. Terragrunt
    // copies each module into a per-invocation `.terragrunt-cache` working directory; without this,
    // local state lands inside that throwaway copy, so a later `terragrunt output` (run from a fresh
    // copy) cannot see the state a prior `terragrunt apply` wrote. Generating a `backend.tf` that
    // points at `${get_terragrunt_dir()}/terraform.tfstate` keeps the state in one fixed place that
    // every terragrunt command shares. Users who want a remote backend override this block.
    sections.push(
      [
        'remote_state {',
        `${step}backend = "local"`,
        `${step}generate = {`,
        `${step}${step}path      = "backend.tf"`,
        `${step}${step}if_exists = "overwrite_terragrunt"`,
        `${step}}`,
        `${step}config = {`,
        `${step}${step}path = "\${get_terragrunt_dir()}/terraform.tfstate"`,
        `${step}}`,
        '}',
      ].join('\n'),
    );

    // Dependency blocks, with mock outputs so `run-all plan` works before first apply.
    for (const producerModuleId of [...moduleWiring.moduleDependencies.keys()].sort()) {
      const dependencyName = StringUtility.sanitizeForIdentifier(producerModuleId);
      // Map each consumed output name to its mock shape: a flat string for per-key scalar outputs,
      // or an object (keyed by the accessed fields) for an external producer's entire-response output.
      const mockOutputs = new Map<
        string,
        { producerResourceId: string; responseKey?: string; responseKeys?: Set<string> }
      >();
      for (const v of moduleWiring.autoVariables.values()) {
        if (v.producerModuleId !== producerModuleId) {
          continue;
        }
        if (v.objectKeys) {
          const responseKeys = mockOutputs.get(v.outputName)?.responseKeys ?? new Set<string>();
          for (const key of v.objectKeys) {
            responseKeys.add(key);
          }
          mockOutputs.set(v.outputName, { producerResourceId: v.producerResourceId, responseKeys });
        } else if (!mockOutputs.has(v.outputName)) {
          mockOutputs.set(v.outputName, { producerResourceId: v.producerResourceId, responseKey: v.responseKey });
        }
      }

      // Prefer the producer schema's declared default value (an author-written, non-secret
      // placeholder, e.g. a syntactically valid ARN) over a synthetic placeholder, falling back to
      // `mock-*` when the schema declares no default for that response key.
      const mockValue = (producerResourceId: string, responseKey: string, fallback: string): string => {
        const value = this.resourceRegistry.get(producerResourceId)?.responseDefaults[responseKey];
        return typeof value === 'string' && value.length > 0 ? value : fallback;
      };

      const lines = [`dependency "${dependencyName}" {`, `${step}config_path = "../${producerModuleId}"`];
      if (mockOutputs.size > 0) {
        lines.push('');
        lines.push(`${step}mock_outputs = {`);
        for (const outputName of [...mockOutputs.keys()].sort()) {
          const { producerResourceId, responseKey, responseKeys } = mockOutputs.get(outputName)!;
          if (responseKeys) {
            const fields = [...responseKeys]
              .sort()
              .map((key) => `${key} = "${mockValue(producerResourceId, key, `mock-${outputName}-${key}`)}"`);
            lines.push(`${step}${step}"${outputName}" = { ${fields.join(', ')} }`);
          } else {
            lines.push(
              `${step}${step}"${outputName}" = "${mockValue(producerResourceId, responseKey!, `mock-${outputName}`)}"`,
            );
          }
        }
        lines.push(`${step}}`);
        lines.push(`${step}mock_outputs_allowed_terraform_commands = ["init", "plan", "show", "validate"]`);
      }
      lines.push('}');
      sections.push(lines.join('\n'));
    }

    // Inputs wiring.
    const inputEntries = [...moduleWiring.autoVariables.entries()].sort(([a], [b]) => a.localeCompare(b));
    if (inputEntries.length > 0) {
      const lines = ['inputs = {'];
      for (const [variableName, { outputName, producerModuleId }] of inputEntries) {
        lines.push(
          `${step}${variableName} = dependency.${StringUtility.sanitizeForIdentifier(producerModuleId)}.outputs["${outputName}"]`,
        );
      }
      lines.push('}');
      sections.push(lines.join('\n'));
    }

    return sections.join('\n\n');
  }

  reset(): void {
    this.minTerraformVersion = '1.6.0';
    this.providers.clear();
    this.requiredProviders = {};
    this.resetTransactionState();
  }

  /**
   * Clears what a transaction's sweep contributed (modules, resources, wiring), keeping the
   * per-process registrations (terraform config and providers) intact. Test harnesses that run
   * multiple transactions in one process call this between them; a real octo process runs one
   * transaction, so production code never resets.
   */
  resetTransactionState(): void {
    this.modules.clear();
    this.pendingExternalResourcesInputWiring.length = 0;
    this.resourceRegistry.clear();
    this.sanitizedResourceIds.clear();
  }

  private get step(): string {
    return ' '.repeat(this.indentLength);
  }

  scope(moduleId: string): TerraformModuleScope {
    return {
      addOctoTerraformExternalResource: (octoResource) => this.addOctoTerraformExternalResource(moduleId, octoResource),
      addOctoTerraformResource: (octoResource, options = {}) =>
        this.addOctoTerraformResource(moduleId, octoResource, options),
      addTerraformData: (type, name, spec = {}) => this.addTerraformData(moduleId, type, name, spec),
      getProviderAliasRef: (accountId, regionId) => this.getProviderAliasRef(moduleId, accountId, regionId),
      getRef: ((resource: UnknownResource | MatchingResource<any>, key: string) =>
        this.getRef(resource as UnknownResource, key)) as TerraformModuleScope['getRef'],
      jsonencode: (subject) => this.jsonencode(subject),
      mapAttr: (value) => this.mapAttr(value),
      moduleId,
      raw: (value) => this.raw(value),
      type: (schema) => this.type(schema),
      variable: (name, typeExpression, options) => this.variable(moduleId, name, typeExpression, options),
    };
  }

  private type(schema: unknown): HclExpression {
    return new TypeHclNode(schema);
  }

  private variable(
    moduleId: string,
    name: string,
    typeExpression: unknown,
    options: { default: TerraformLiteralType; sensitive: boolean },
  ): TerraformVariable {
    const resolvedType =
      typeof typeExpression === 'string' && !['any', 'bool', 'number', 'string'].includes(typeExpression)
        ? new ExpressionHclNode(typeExpression)
        : new TypeHclNode(typeExpression);

    const variable = new TerraformVariable(name, resolvedType, options);
    this.module(moduleId).variables.push(variable);
    return variable;
  }

  /**
   * Resolves the deferred parent-input wiring for every external resource: for each parent, expands
   * its declared outputs into `--input` arguments on the `local-exec` create/destroy commands and
   * into individual triggers (so the `when = destroy` provisioner can reach the raw values via
   * `self.triggers`). Runs once all resources are registered, so it is independent of the order in
   * which resources were contributed. Idempotent: clears the queue, so a repeat call is a no-op.
   */
  private wireExternalResourceInputs(): void {
    for (const { name, nullResource, octoResource, resourceId } of this.pendingExternalResourcesInputWiring) {
      const parents: UnknownResource[] = (octoResource.parents || []).map((p) =>
        p instanceof MatchingResource ? p.getActual() : p,
      );

      // A native parent contributes one input per output key; an external parent its whole result as a single input.
      const inputs: { argKey: string; ref: RefHclNode; triggerKey: string }[] = [];
      for (const parent of parents) {
        const parentOctoResource = this.resourceRegistry.get(parent.resourceId);
        if (!parentOctoResource) {
          throw new Error(
            `Parent resource "${parent.resourceId}" of external resource "${resourceId}" is not registered with Terraform!`,
          );
        }
        if (parentOctoResource.externalResultExpression !== undefined) {
          inputs.push({
            argKey: parent.resourceId,
            ref: new RefHclNode(parent.resourceId, '', true),
            triggerKey: StringUtility.sanitizeForEnvironmentVariable(`input_${parent.resourceId}`),
          });
        } else {
          for (const key of parentOctoResource.outputs.keys()) {
            inputs.push({
              argKey: `${parent.resourceId}.${key}`,
              ref: new RefHclNode(parent.resourceId, key),
              triggerKey: StringUtility.sanitizeForEnvironmentVariable(`input_${parent.resourceId}_${key}`),
            });
          }
        }
      }

      const outputsDir = '${path.module}/.octo-outputs';
      const outputsFile = `${outputsDir}/${name}.json`;
      const createCommand: (string | HclExpression)[] = [
        `mkdir -p ${outputsDir} && ${this.runOctoResourceActionCommandPrefix} --resourceId=${resourceId}`,
      ];
      const destroyCommand: (string | HclExpression)[] = [
        `${this.runOctoResourceActionCommandPrefix} --resourceId=${resourceId}`,
      ];
      for (const input of inputs) {
        createCommand.push(` --input ${input.argKey}=`, input.ref);
        destroyCommand.push(` --input ${input.argKey}=\${self.triggers.${input.triggerKey}}`);
      }
      createCommand.push(` > ${outputsFile}`);

      const triggers: [string, HclExpression][] = [
        ['octo_properties_hash', new LiteralHclNode(StringUtility.deterministicHash(octoResource.properties))],
        ...inputs.map((i): [string, HclExpression] => [i.triggerKey, new InterpolatedStringHclNode([i.ref])]),
      ];
      nullResource.attribute('triggers', new MapHclNode(triggers));

      const createProvisioner = nullResource.block('provisioner "local-exec"');
      createProvisioner.attribute('command', new InterpolatedStringHclNode(createCommand));

      const destroyProvisioner = nullResource.block('provisioner "local-exec"');
      destroyProvisioner.attribute('when', new ExpressionHclNode('destroy'));
      destroyProvisioner.attribute('command', new InterpolatedStringHclNode(destroyCommand));
    }

    this.pendingExternalResourcesInputWiring.length = 0;
  }
}

/**
 * @internal
 */
@Factory<TerraformService>(TerraformService)
export class TerraformServiceFactory {
  private static instance: TerraformService;

  static async create(
    {
      runOctoResourceActionCommandPrefix = 'octo run-action',
      terraformFileIndentLength = 2,
    }: {
      runOctoResourceActionCommandPrefix?: string;
      terraformFileIndentLength?: number;
    } = {},
    forceNew: boolean = false,
  ): Promise<TerraformService> {
    if (!this.instance) {
      this.instance = new TerraformService(runOctoResourceActionCommandPrefix, terraformFileIndentLength);
    }

    if (forceNew) {
      this.instance.reset();
    }

    return this.instance;
  }
}
