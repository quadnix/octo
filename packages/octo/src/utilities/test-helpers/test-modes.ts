import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'path';
import { NodeType, type UnknownResource } from '../../app.type.js';
import { TestContainer } from '../../functions/container/test-container.js';
import type { Diff } from '../../functions/diff/diff.js';
import type { Octo } from '../../main.js';
import type { App } from '../../models/app/app.model.js';
import { ModuleContainer } from '../../modules/module.container.js';
import { TestModuleContainer } from '../../modules/test-module.container.js';
import { OverlayDataRepository } from '../../overlays/overlay-data.repository.js';
import type { IResourceAction } from '../../resources/resource-action.interface.js';
import { ResourceDataRepository } from '../../resources/resource-data.repository.js';
import { AResource } from '../../resources/resource.abstract.js';
import type { BaseResourceSchema } from '../../resources/resource.schema.js';
import { ATerraformResource } from '../../resources/terraform-resource.abstract.js';
import { EventService } from '../../services/event/event.service.js';
import { InputService } from '../../services/input/input.service.js';
import { ResourceSerializationService } from '../../services/serialization/resource/resource-serialization.service.js';
import { TestStateProvider } from '../../services/state-management/test.state-provider.js';
import { type TerraformModuleScope, TerraformService } from '../../services/terraform/terraform.service.js';
import { TransactionService } from '../../services/transaction/transaction.service.js';

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
    const vpcTf = terraform.addOctoTerraformResource(this as TfVpcResource);
    vpcTf.addTerraformResource('aws_vpc', this.resourceId, { cidr_block: this.properties['CidrBlock'] });
    vpcTf.output({ VpcId: terraform.raw(`aws_vpc.${this.resourceId}.id`) });
  }
}

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
  private igwResponse: BaseResourceSchema['response'] = { igwId: 'igw-0real' };

  private constructor(
    readonly octo: Octo,
    readonly outputDir: string,
    readonly resourceDataRepository: ResourceDataRepository,
    private readonly testModuleContainer: TestModuleContainer,
  ) {}

  static async create(): Promise<TestModes> {
    const container = await TestContainer.create({ mocks: [] }, { factoryTimeoutInMs: 500 });

    const [eventService, inputService, moduleContainer, overlayDataRepository, resourceDataRepository] =
      await Promise.all([
        container.get(EventService),
        container.get(InputService),
        container.get(ModuleContainer),
        container.get(OverlayDataRepository),
        container.get(ResourceDataRepository),
      ]);

    const resourceSerializationService = new ResourceSerializationService(resourceDataRepository);
    container.unRegisterFactory(ResourceSerializationService);
    container.registerValue(ResourceSerializationService, resourceSerializationService);

    const terraformService = new TerraformService();
    container.unRegisterFactory(TerraformService);
    container.registerValue(TerraformService, terraformService);

    const transactionService = new TransactionService(
      eventService,
      inputService,
      moduleContainer,
      overlayDataRepository,
      resourceDataRepository,
      terraformService,
    );
    container.unRegisterFactory(TransactionService);
    container.registerValue(TransactionService, transactionService);

    const testModuleContainer = new TestModuleContainer();
    await testModuleContainer.initialize(new TestStateProvider());

    const outputDir = await mkdtemp(join(tmpdir(), 'octo-modes-test-'));
    const instance = new TestModes(testModuleContainer.octo, outputDir, resourceDataRepository, testModuleContainer);

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

  setIgwResponse(response: BaseResourceSchema['response']): void {
    this.igwResponse = response;
  }

  async teardown(): Promise<void> {
    await rm(this.outputDir, { force: true, recursive: true });
    await this.testModuleContainer.reset();
    await TestContainer.reset();
  }

  async writePlan(moduleId: string, resourceChanges: { actions: string[]; address: string }[]): Promise<void> {
    await mkdir(join(this.outputDir, moduleId), { recursive: true });
    await writeFile(
      join(this.outputDir, moduleId, 'plan.json'),
      JSON.stringify({
        resource_changes: resourceChanges.map((c) => ({
          address: c.address,
          change: { actions: c.actions },
          mode: 'managed',
        })),
      }),
      'utf-8',
    );
  }

  async writeTfState(moduleId: string, outputs: Record<string, unknown>): Promise<void> {
    await mkdir(join(this.outputDir, moduleId), { recursive: true });
    await writeFile(
      join(this.outputDir, moduleId, 'terraform.tfstate'),
      JSON.stringify({
        outputs: Object.fromEntries(Object.entries(outputs).map(([k, v]) => [k, { type: 'string', value: v }])),
      }),
      'utf-8',
    );
  }
}
