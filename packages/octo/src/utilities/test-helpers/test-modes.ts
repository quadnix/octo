import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'path';
import {
  type ModelSerializedOutput,
  NodeType,
  type ResourceSerializedOutput,
  type TerraformFolderOutput,
  type TerraformResourceOutput,
  type UnknownResource,
} from '../../app.type.js';
import { ResourceError } from '../../errors/index.js';
import { TestContainer } from '../../functions/container/test-container.js';
import { Diff, DiffAction } from '../../functions/diff/diff.js';
import { DiffUtility } from '../../functions/diff/diff.utility.js';
import type { Octo } from '../../main.js';
import type { App } from '../../models/app/app.model.js';
import type { TerraformPlan } from '../../modes/validate.mode.js';
import { TestModuleContainer } from '../../modules/test-module.container.js';
import type { IResourceAction } from '../../resources/resource-action.interface.js';
import { ResourceDataRepository } from '../../resources/resource-data.repository.js';
import { AResource } from '../../resources/resource.abstract.js';
import type { BaseResourceSchema } from '../../resources/resource.schema.js';
import { ATerraformResource } from '../../resources/terraform-resource.abstract.js';
import { StateManagementService } from '../../services/state-management/state-management.service.js';
import { TestStateProvider } from '../../services/state-management/test.state-provider.js';
import { type TerraformModuleScope, TerraformService } from '../../services/terraform/terraform.service.js';
import { TransactionService } from '../../services/transaction/transaction.service.js';

/**
 * An external resource: lifecycle runs outside terraform via a resource action.
 *
 * @internal
 */
export class ExternalIgwResource extends AResource<BaseResourceSchema, ExternalIgwResource> {
  static override readonly NODE_NAME: string = 'sdk-igw';
  static override readonly NODE_PACKAGE: string = '@octo';
  static override readonly NODE_SCHEMA = {};
  static override readonly NODE_TYPE: NodeType = NodeType.RESOURCE;

  constructor(resourceId: string, properties: BaseResourceSchema['properties'] = {}, parents: UnknownResource[] = []) {
    super(resourceId, properties, parents);
  }
}

/**
 * A native terraform resource that references an (external) parent via `getRef`.
 *
 * @internal
 */
export class TfSgResource extends ATerraformResource<BaseResourceSchema, TfSgResource> {
  static override readonly NODE_NAME: string = 'tf-sg';
  static override readonly NODE_PACKAGE: string = '@octo';
  static override readonly NODE_SCHEMA = {};
  static override readonly NODE_TYPE: NodeType = NodeType.RESOURCE;

  constructor(resourceId: string, properties: BaseResourceSchema['properties'] = {}, parents: UnknownResource[] = []) {
    super(resourceId, properties, parents);
  }

  override async toHCL(terraform: TerraformModuleScope): Promise<void> {
    const igw = this.parents[0] as UnknownResource;
    const sgTf = terraform.addOctoTerraformResource(this as TfSgResource);
    sgTf.addTerraformResource('aws_security_group', this.resourceId, {
      igw_id: terraform.getRef(igw, 'igwId'),
    });
    sgTf.output({ SgId: terraform.raw(`aws_security_group.${this.resourceId}.id`) });
  }
}

/**
 * A native terraform resource that contributes an `aws_vpc` block and publishes its id.
 *
 * @internal
 */
export class TfVpcResource extends ATerraformResource<BaseResourceSchema, TfVpcResource> {
  static override readonly NODE_NAME: string = 'tf-vpc';
  static override readonly NODE_PACKAGE: string = '@octo';
  static override readonly NODE_SCHEMA = {};
  static override readonly NODE_TYPE: NodeType = NodeType.RESOURCE;

  constructor(resourceId: string, properties: BaseResourceSchema['properties'] = {}, parents: UnknownResource[] = []) {
    super(resourceId, properties, parents);
  }

  override async toHCL(terraform: TerraformModuleScope): Promise<void> {
    // Bind a provider only when the resource carries an accountId, so the default (provider-less)
    // graph keeps exercising the no-provider path while a provider-aware test can opt in.
    const provider = this.properties['accountId']
      ? {
          provider: {
            accountId: this.properties['accountId'] as string,
            regionId: this.properties['regionId'] as string | undefined,
          },
        }
      : undefined;
    const vpcTf = terraform.addOctoTerraformResource(this as TfVpcResource, provider);
    vpcTf.addTerraformResource('aws_vpc', this.resourceId, { cidr_block: this.properties['CidrBlock'] });
    vpcTf.output({ VpcId: terraform.raw(`aws_vpc.${this.resourceId}.id`) });
  }
}

/**
 * A native terraform resource whose author declares that any property change recreates it: its
 * `diffProperties` emits a single `REPLACE` instead of a granular update. Used to exercise the
 * first-class REPLACE action and the validate replacement cascade.
 *
 * @internal
 */
export class ReplacingTfVpcResource extends ATerraformResource<BaseResourceSchema, ReplacingTfVpcResource> {
  static override readonly NODE_NAME: string = 'replacing-tf-vpc';
  static override readonly NODE_PACKAGE: string = '@octo';
  static override readonly NODE_SCHEMA = {};
  static override readonly NODE_TYPE: NodeType = NodeType.RESOURCE;

  constructor(resourceId: string, properties: BaseResourceSchema['properties'] = {}, parents: UnknownResource[] = []) {
    super(resourceId, properties, parents);
  }

  override async diffProperties(previous: ReplacingTfVpcResource): Promise<Diff[]> {
    if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties)) {
      return [new Diff(this, DiffAction.REPLACE, 'properties', '', 'CidrBlock change forces VPC recreation')];
    }
    return [];
  }

  override async toHCL(terraform: TerraformModuleScope): Promise<void> {
    const vpcTf = terraform.addOctoTerraformResource(this as ReplacingTfVpcResource);
    vpcTf.addTerraformResource('aws_vpc', this.resourceId, { cidr_block: this.properties['CidrBlock'] });
    vpcTf.output({ VpcId: terraform.raw(`aws_vpc.${this.resourceId}.id`) });
  }
}

/**
 * A native terraform resource whose author refuses any property update by throwing in
 * `diffProperties`. Used to prove that an author refusal in a `diff*` method aborts generation
 * before any HCL is built. Its `toHCL` records every invocation in {@link toHCLInvocations}, so a
 * test can assert it was never reached when the diff threw.
 *
 * @internal
 */
export class RefusingTfResource extends ATerraformResource<BaseResourceSchema, RefusingTfResource> {
  static override readonly NODE_NAME: string = 'refusing-tf';
  static override readonly NODE_PACKAGE: string = '@octo';
  static override readonly NODE_SCHEMA = {};
  static override readonly NODE_TYPE: NodeType = NodeType.RESOURCE;

  static readonly toHCLInvocations: string[] = [];

  constructor(resourceId: string, properties: BaseResourceSchema['properties'] = {}, parents: UnknownResource[] = []) {
    super(resourceId, properties, parents);
  }

  override async diffProperties(previous: RefusingTfResource): Promise<Diff[]> {
    if (!DiffUtility.isObjectDeepEquals(previous.properties, this.properties)) {
      throw new ResourceError('Cannot update RefusingTfResource once it has been created!', this);
    }
    return super.diffProperties(previous);
  }

  override async toHCL(terraform: TerraformModuleScope): Promise<void> {
    RefusingTfResource.toHCLInvocations.push(this.resourceId);
    const tf = terraform.addOctoTerraformResource(this as RefusingTfResource);
    tf.addTerraformResource('aws_vpc', this.resourceId, { cidr_block: this.properties['CidrBlock'] });
    tf.output({ VpcId: terraform.raw(`aws_vpc.${this.resourceId}.id`) });
  }
}

/**
 * Test harness for the `Octo` mode functions. {@link create} bootstraps an isolated container (via
 * {@link TestContainer}) with real test terraform + transaction services and an external igw
 * resource action, mirroring the wiring an `Octo` boot performs; the mode functions under test
 * resolve those services from the container themselves. The instance exposes the standard
 * vpc → igw → sg graph across two module folders plus helpers to fabricate terraform plan/state
 * fixtures.
 *
 * @internal
 */
export class TestModes {
  readonly igwActionHandledDiffs: Diff[] = [];
  private readonly igwResponse: BaseResourceSchema['response'] = { igwId: 'igw-0real' };

  readonly outputs = new Map<string, Record<string, { value: unknown }>>();
  readonly plans = new Map<string, TerraformPlan>();

  private readonly terraformConfigs: Parameters<Octo['registerTerraformConfig']>[] = [];
  private readonly terraformProviders: Parameters<Octo['registerTerraformProvider']>[] = [];

  private constructor(
    private readonly octo: Octo,
    readonly outputDir: string,
    readonly resourceDataRepository: ResourceDataRepository,
    private readonly stateManagementService: StateManagementService,
    private readonly terraformService: TerraformService,
    private readonly testModuleContainer: TestModuleContainer,
  ) {}

  /**
   * Registers an additional resource into an existing module folder, the way a model action would
   * contribute a new resource on a re-run. Use after {@link createResourceGraph} to exercise an add
   * of a brand-new resource (module-attributed, so it lands in the named folder rather than the
   * provider-less `default` folder).
   */
  async addResource(moduleId: string, resource: UnknownResource): Promise<void> {
    await this.testModuleContainer.createResources(moduleId, [resource]);
  }

  async commit(...args: Parameters<Octo['commit']>): ReturnType<Octo['commit']> {
    await this.simulateFreshProcess();
    return this.octo.commit(...args);
  }

  static async create(): Promise<TestModes> {
    const container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500, force: true });

    const [resourceDataRepository, terraformService, transactionService] = await Promise.all([
      container.get(ResourceDataRepository),
      container.get(TerraformService),
      container.get(TransactionService),
    ]);

    const testModuleContainer = new TestModuleContainer(container);
    await testModuleContainer.initialize(new TestStateProvider());

    const stateManagementService = await container.get(StateManagementService);

    const outputDir = await mkdtemp(join(tmpdir(), 'octo-modes-test-'));
    const instance = new TestModes(
      testModuleContainer['octo'],
      outputDir,
      resourceDataRepository,
      stateManagementService,
      terraformService,
      testModuleContainer,
    );

    // Registered after the instance exists so the action can read/append its mutable state. No
    // transaction runs during initialize(), so registering here is in time for the mode under test.
    const igwResourceAction: IResourceAction<ExternalIgwResource> = {
      filter: (): boolean => true,
      handle: async (diff: Diff): Promise<BaseResourceSchema['response']> => {
        instance.igwActionHandledDiffs.push(diff);
        return diff.action === 'delete' ? {} : instance.igwResponse;
      },
    };
    transactionService.registerResourceActions(ExternalIgwResource, [igwResourceAction]);

    return instance;
  }

  async createProviderBoundResourceGraph(provider: { accountId: string; regionId?: string }): Promise<{
    app: App;
    vpc: TfVpcResource;
  }> {
    const {
      app: [app],
    } = await this.testModuleContainer.createTestModels('app-module', { app: ['test-app'] });

    const vpc = new TfVpcResource('vpc-1', {
      accountId: provider.accountId,
      CidrBlock: '10.0.0.0/16',
      regionId: provider.regionId,
    });
    await this.testModuleContainer.createResources('region-module', [vpc]);

    return { app: app as App, vpc };
  }

  async createResourceGraph(options?: {
    save?: boolean;
  }): Promise<{ app: App; igw: ExternalIgwResource; sg: TfSgResource; vpc: TfVpcResource }> {
    const {
      app: [app],
    } = await this.testModuleContainer.createTestModels('app-module', { app: ['test-app'] });

    const vpc = new TfVpcResource('vpc-1', { CidrBlock: '10.0.0.0/16' });
    const igw = new ExternalIgwResource('igw-1', { Type: 'internet-gateway' }, [vpc]);
    const sg = new TfSgResource('sg-1', {}, [igw]);
    await this.testModuleContainer.createResources('region-module', [vpc, igw], options);
    await this.testModuleContainer.createResources('sg-module', [sg], options);

    return { app: app as App, igw, sg, vpc };
  }

  /**
   * Stages a single {@link RefusingTfResource} in `region-module`. With `save: true`, commits it so a
   * later re-stage with changed properties drives an update that the resource refuses. Used to prove
   * that an author refusal in `diff*` aborts generation before HCL is built.
   */
  async createRefusingResourceGraph(options?: { save?: boolean }): Promise<{ app: App; refusing: RefusingTfResource }> {
    const {
      app: [app],
    } = await this.testModuleContainer.createTestModels('app-module', { app: ['test-app'] });

    const refusing = new RefusingTfResource('refuse-1', { CidrBlock: '10.0.0.0/16' });
    await this.testModuleContainer.createResources('region-module', [refusing], options);

    return { app: app as App, refusing };
  }

  /**
   * Same `vpc → igw → sg` shape as {@link createResourceGraph}, but the vpc is a
   * {@link ReplacingTfVpcResource}, so changing its properties later yields a REPLACE that cascades
   * (in terraform) onto igw and sg. Used to exercise the validate replacement cascade.
   */
  async createReplaceableResourceGraph(options?: {
    save?: boolean;
  }): Promise<{ app: App; igw: ExternalIgwResource; sg: TfSgResource; vpc: ReplacingTfVpcResource }> {
    const {
      app: [app],
    } = await this.testModuleContainer.createTestModels('app-module', { app: ['test-app'] });

    const vpc = new ReplacingTfVpcResource('vpc-1', { CidrBlock: '10.0.0.0/16' });
    const igw = new ExternalIgwResource('igw-1', { Type: 'internet-gateway' }, [vpc]);
    const sg = new TfSgResource('sg-1', {}, [igw]);
    await this.testModuleContainer.createResources('region-module', [vpc, igw], options);
    await this.testModuleContainer.createResources('sg-module', [sg], options);

    return { app: app as App, igw, sg, vpc };
  }

  async generate(...args: Parameters<Octo['generate']>): ReturnType<Octo['generate']> {
    await this.simulateFreshProcess();
    return this.octo.generate(...args);
  }

  async getModelState(): Promise<ModelSerializedOutput> {
    const { data } = await this.stateManagementService.getModelState('models.json');
    return data;
  }

  async getResourceState(fileName = 'resources-old.json'): Promise<ResourceSerializedOutput> {
    const { data } = await this.stateManagementService.getResourceState(fileName);
    return data;
  }

  async getCommittedTerraformState(): Promise<{
    terraformFolders: TerraformFolderOutput[];
    terraformResources: TerraformResourceOutput[];
  }> {
    const { userData } = await this.stateManagementService.getResourceState('resources-actual.json');
    const { terraformFolders, terraformResources } = userData as {
      terraformFolders?: TerraformFolderOutput[];
      terraformResources?: TerraformResourceOutput[];
    };
    return { terraformFolders: terraformFolders ?? [], terraformResources: terraformResources ?? [] };
  }

  async getTerraformFolderRecords(): Promise<TerraformFolderOutput[]> {
    const { userData } = await this.stateManagementService.getModelState('models.json');
    return (userData as { terraformFolders?: TerraformFolderOutput[] }).terraformFolders ?? [];
  }

  registerTerraformConfig(...args: Parameters<Octo['registerTerraformConfig']>): void {
    this.terraformConfigs.push(args);
    this.octo.registerTerraformConfig(...args);
  }

  registerTerraformProvider(...args: Parameters<Octo['registerTerraformProvider']>): void {
    this.terraformProviders.push(args);
    this.octo.registerTerraformProvider(...args);
  }

  async runAction(...args: Parameters<Octo['runAction']>): ReturnType<Octo['runAction']> {
    await this.simulateFreshProcess();
    return this.octo.runAction(...args);
  }

  /**
   * Simulates the boot of a fresh octo process: fully reset the terraform service, then replay the
   * recorded config/provider registrations (config before providers, as boot order requires).
   */
  async simulateFreshProcess(): Promise<void> {
    this.terraformService.reset();
    for (const args of this.terraformConfigs) {
      this.octo.registerTerraformConfig(...args);
    }
    for (const args of this.terraformProviders) {
      this.octo.registerTerraformProvider(...args);
    }
  }

  async teardown(): Promise<void> {
    await rm(this.outputDir, { force: true, recursive: true });
    await this.testModuleContainer.reset();
    await TestContainer.reset();
  }

  async validate(...args: Parameters<Octo['validate']>): ReturnType<Octo['validate']> {
    await this.simulateFreshProcess();
    return this.octo.validate(...args);
  }

  writePlan(moduleId: string, resourceChanges: { actions: string[]; address: string }[]): void {
    this.plans.set(moduleId, {
      resource_changes: resourceChanges.map((c) => ({
        address: c.address,
        change: { actions: c.actions },
        mode: 'managed',
      })),
    });
  }

  writeTfState(moduleId: string, outputs: Record<string, unknown>): void {
    this.outputs.set(
      moduleId,
      Object.fromEntries(Object.entries(outputs).map(([k, v]) => [k, { type: 'string', value: v }])),
    );
  }
}
