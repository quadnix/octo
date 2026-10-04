import {
  type ActionInputs,
  type Constructable,
  type IUnknownModelAction,
  type IUnknownResourceAction,
  MatchingAnchor,
  NodeType,
  type TransactionOptions,
  type UnknownModel,
  type UnknownOverlay,
  type UnknownResource,
  ValidationType,
} from '../../app.type.js';
import { EventSource } from '../../decorators/event-source.decorator.js';
import { Factory } from '../../decorators/factory.decorator.js';
import {
  InputNotFoundTransactionError,
  ResourceActionExceptionTransactionError,
  ResourceActionTimeoutTransactionError,
  TransactionError,
  ValidationTransactionError,
} from '../../errors/index.js';
import {
  ModelActionRegistrationEvent,
  ModelActionTransactionEvent,
  ModelDiffsTransactionEvent,
  ModelTransactionTransactionEvent,
  ResourceActionCompletedTransactionEvent,
  ResourceActionInitiatedTransactionEvent,
  ResourceActionRegistrationEvent,
  ResourceActionSummaryTransactionEvent,
  ResourceDiffsTransactionEvent,
  ResourceTransactionTransactionEvent,
} from '../../events/index.js';
import { Container } from '../../functions/container/container.js';
import { DiffMetadata } from '../../functions/diff/diff-metadata.js';
import { type Diff, DiffAction } from '../../functions/diff/diff.js';
import type { ANode } from '../../functions/node/node.abstract.js';
import type { AModel } from '../../models/model.abstract.js';
import { ModuleContainer } from '../../modules/module.container.js';
import { OverlayDataRepository } from '../../overlays/overlay-data.repository.js';
import { AOverlay } from '../../overlays/overlay.abstract.js';
import { ResourceDataRepository } from '../../resources/resource-data.repository.js';
import { AResource } from '../../resources/resource.abstract.js';
import { ATerraformResource } from '../../resources/terraform-resource.abstract.js';
import { DiffUtility } from '../../utilities/diff/diff.utility.js';
import { EventService } from '../event/event.service.js';
import { InputService } from '../input/input.service.js';
import { ResourceSerializationService } from '../serialization/resource/resource-serialization.service.js';
import { TerraformService } from '../terraform/terraform.service.js';

/**
 * No-op resource action backing terraform resource diffs. Terraform manages the resource's lifecycle;
 * octo only carries the diff for review and validation.
 *
 * @internal
 */
class TerraformNoopResourceAction implements IUnknownResourceAction {
  /**
   * @internal
   */
  filter(): boolean {
    return true;
  }

  /**
   * @internal
   */
  async handle(): Promise<void> {}
}

/**
 * @internal
 */
export class TransactionService {
  private modelActions: { actions: IUnknownModelAction[]; modelClass: Constructable<UnknownModel> }[] = [];
  private overlayActions: { actions: IUnknownModelAction[]; overlayClass: Constructable<UnknownOverlay> }[] = [];
  private resourceActions: { actions: IUnknownResourceAction[]; resourceClass: Constructable<UnknownResource> }[] = [];

  /**
   * @internal
   */
  constructor(
    private readonly eventService: EventService,
    private readonly inputService: InputService,
    private readonly moduleContainer: ModuleContainer,
    private readonly overlayDataRepository: OverlayDataRepository,
    private readonly resourceDataRepository: ResourceDataRepository,
    private readonly resourceSerializationService: ResourceSerializationService,
    private readonly terraformService: TerraformService,
  ) {}

  /**
   * Runs the delete action of every **external** resource in `resourceDiffs` that is being deleted.
   *
   * Terraform cannot do this. Octo deletes a resource by removing its block from the configuration,
   * and terraform will not run a `when = destroy` provisioner for a resource that is no longer in
   * the configuration - it drops the `null_resource` from state and moves on. So the callback that
   * would have told an external resource to delete itself never fires, and the real thing it created
   * outlives both state files with nothing tracking it.
   *
   * Octo knows the resource was deleted, which is why this can be driven from its own diff instead.
   * {@link commit} calls it before recording anything, so a failed delete leaves octo state untouched
   * and the deletion is retried on the next run rather than being forgotten.
   *
   * Terraform-managed resources are excluded: terraform destroys those itself, and a resource action
   * on one is rejected everywhere else in octo.
   *
   * @returns The diffs whose actions ran, in the order they ran.
   */
  async applyExternalResourceDeletes(resourceDiffs: DiffMetadata[][]): Promise<DiffMetadata[][]> {
    const deleteDiffs = this.getExternalResourceDeletes(resourceDiffs);
    if (deleteDiffs.length === 0) {
      return [];
    }

    // Ordered among themselves: `applyOrder` is assigned across the whole resource diff set, and
    // this is a subset of it, so the levels it carries can start anywhere. Re-basing them from zero
    // keeps applyResources' level walk terminating.
    const orders = [...new Set(deleteDiffs.map((d) => d.applyOrder))].sort((a, b) => a - b);
    for (const diff of deleteDiffs) {
      diff.applyOrder = orders.indexOf(diff.applyOrder);
    }

    // Stateless, like run-action: the actual resource graph is not touched here. `commit` syncs
    // actual to new immediately afterwards, which is what records the deletion.
    return this.applyResources(deleteDiffs, { skipActualResourceUpdate: true });
  }

  /**
   * @internal
   */
  async *beginTransaction(
    diffs: Diff[],
    {
      enableResourceValidation = false,
      filterResourceDiffsByResourceId = undefined,
      generateTerraform = false,
      skipActualResourceUpdate = false,
      yieldModelDiffs = false,
      yieldModelTransaction = false,
      yieldResourceDiffs = false,
      yieldResourceTransaction = false,
    }: TransactionOptions = {},
  ): AsyncGenerator<DiffMetadata[][], DiffMetadata[][]> {
    // Diff overlays and add to existing diffs.
    const overlayDiffs = await this.overlayDataRepository.diff();
    diffs.push(...overlayDiffs);

    // Generate diff on models.
    const modelDiffs = diffs.map((d) => {
      if ((d.node.constructor as typeof ANode).NODE_TYPE === NodeType.OVERLAY) {
        return new DiffMetadata(
          d,
          (
            this.overlayActions.find(
              (a) => (a.overlayClass as unknown as typeof AOverlay) === (d.node.constructor as typeof AOverlay),
            )?.actions || []
          ).filter((a) => a.filter(d)),
        );
      } else {
        return new DiffMetadata(
          d,
          (
            this.modelActions.find(
              (a) => (a.modelClass as unknown as typeof AModel) === (d.node.constructor as typeof AModel),
            )?.actions || []
          ).filter((a) => a.filter(d)),
        );
      }
    });
    // Set apply order on model diffs.
    for (const diff of modelDiffs) {
      this.setApplyOrder(diff, modelDiffs);
    }

    this.eventService.emit(new ModelDiffsTransactionEvent(undefined, [modelDiffs]));
    if (yieldModelDiffs) {
      yield [modelDiffs];
    }

    // Apply model diffs.
    const modelTransaction = await this.applyModels(modelDiffs);

    this.eventService.emit(new ModelTransactionTransactionEvent(undefined, modelTransaction));
    if (yieldModelTransaction) {
      yield modelTransaction;
    }

    // Generate resource diffs.
    let newDiffs = await this.resourceDataRepository.diff();
    let dirtyDiffs = await this.resourceDataRepository.diffDirty();

    // Scope diffs to a single resource, e.g. when terraform invokes octo for one resource action.
    if (filterResourceDiffsByResourceId !== undefined) {
      newDiffs = newDiffs.filter((d) => (d.node as UnknownResource).resourceId === filterResourceDiffsByResourceId);
      dirtyDiffs = dirtyDiffs.filter((d) => (d.node as UnknownResource).resourceId === filterResourceDiffsByResourceId);

      // Prefer dirty diffs (actual-graph nodes) over equal new diffs (old-graph nodes) for
      // execution: deserialized old resources are frozen and cannot receive injected inputs.
      for (let i = newDiffs.length - 1; i >= 0; i--) {
        const newDiff = newDiffs[i];
        if (
          dirtyDiffs.some(
            (d) =>
              d.node.getContext() === newDiff.node.getContext() &&
              d.action === newDiff.action &&
              d.field === newDiff.field &&
              DiffUtility.isObjectDeepEquals(d.value, newDiff.value),
          )
        ) {
          newDiffs.splice(i, 1);
        }
      }
    }

    if (enableResourceValidation && (newDiffs.length > 0 || dirtyDiffs.length > 0)) {
      throw new TransactionError('Cannot run resource validation with pending resource diffs!');
    }

    if (enableResourceValidation) {
      const validationDiffs = this.resourceDataRepository.diffValidate();
      newDiffs.push(...validationDiffs);
      dirtyDiffs.push(...validationDiffs);
    }

    // new diffs = new - old | dirty diffs = new - actual
    // Any new diff that is also not part of dirty diffs should be skipped, as the actual is already in desired state.
    for (let i = newDiffs.length - 1; i >= 0; i--) {
      const newDiff = newDiffs[i];
      if (
        !dirtyDiffs.some(
          (d) =>
            d.node.getContext() === newDiff.node.getContext() &&
            d.action === newDiff.action &&
            d.field === newDiff.field &&
            DiffUtility.isObjectDeepEquals(d.value, newDiff.value),
        )
      ) {
        newDiffs.splice(i, 1);
      }
    }

    // Ensure any new diffs are not operating on dirty resources.
    this.resourceDataRepository.ensureDiffsNotOperatingOnDirtyResources(newDiffs);

    // Skip processing dirty diffs that are already accounted for in new diffs.
    for (let i = dirtyDiffs.length - 1; i >= 0; i--) {
      const dirtyDiff = dirtyDiffs[i];
      if (
        newDiffs.some(
          (d) =>
            d.node.getContext() === dirtyDiff.node.getContext() &&
            d.action === dirtyDiff.action &&
            d.field === dirtyDiff.field &&
            DiffUtility.isObjectDeepEquals(d.value, dirtyDiff.value),
        )
      ) {
        dirtyDiffs.splice(i, 1);
      }
    }

    // Terraform resources have no resource actions - terraform owns their lifecycle. Their diffs
    // remain part of the transaction as review artifacts, backed by a no-op action.
    const resolveResourceActions = (d: Diff): IUnknownResourceAction[] => {
      if (d.node instanceof ATerraformResource) {
        return [new TerraformNoopResourceAction()];
      }
      return (
        this.resourceActions.find(
          (a) => (a.resourceClass as unknown as typeof AResource) === (d.node.constructor as typeof AResource),
        )?.actions || []
      ).filter((a) => a.filter(d));
    };

    // Generate diff on resources.
    const resourceDiffs = newDiffs.map((d) => new DiffMetadata(d, resolveResourceActions(d)));
    // Set apply order on resource diffs.
    for (const diff of resourceDiffs) {
      this.setApplyOrder(diff, resourceDiffs);
    }
    // Generate diff on dirty resources.
    const dirtyResourceDiffs = dirtyDiffs.map((d) => new DiffMetadata(d, resolveResourceActions(d)));
    // Set apply order on dirty resource diffs.
    for (const diff of dirtyResourceDiffs) {
      this.setApplyOrder(diff, dirtyResourceDiffs);
    }

    // Contribute the full desired resource graph to terraform. Deferred until after resource diffs
    // are computed and ordered, so an author refusal (a throw in diff*) or an ordering/cycle error
    // aborts generation before any HCL is built — diffs gate generation.
    if (generateTerraform) {
      await this.generateTerraform();
    }

    this.eventService.emit(new ResourceDiffsTransactionEvent(undefined, [[resourceDiffs], [dirtyResourceDiffs]]));
    if (yieldResourceDiffs) {
      yield [resourceDiffs, dirtyResourceDiffs];
    }

    // Apply resource diffs.
    const resourceTransaction = await this.applyResources(resourceDiffs, { skipActualResourceUpdate });
    // Apply dirty resource diffs.
    const dirtyResourceTransaction = await this.applyResources(dirtyResourceDiffs, { skipActualResourceUpdate });

    this.eventService.emit(
      new ResourceTransactionTransactionEvent(undefined, [resourceTransaction, dirtyResourceTransaction]),
    );
    if (yieldResourceTransaction) {
      yield [...resourceTransaction, ...dirtyResourceTransaction];
    }

    return modelTransaction;
  }

  /**
   * The diffs {@link TransactionService.applyExternalResourceDeletes} runs: the deletion of every
   * external resource in `resourceDiffs`. A caller that has to decide whether to run them at all
   * names them through this rather than repeating the filter.
   *
   * @internal
   */
  getExternalResourceDeletes(resourceDiffs: DiffMetadata[][]): DiffMetadata[] {
    return resourceDiffs
      .flat()
      .filter(
        (d) =>
          d.action === DiffAction.DELETE &&
          d.field === 'resourceId' &&
          !(d.node instanceof ATerraformResource) &&
          !d.applied,
      );
  }

  /**
   * @internal
   */
  @EventSource(ModelActionRegistrationEvent)
  registerModelActions(forModel: Constructable<UnknownModel>, actions: IUnknownModelAction[]): void {
    const modelActions = this.modelActions.find((a) => a.modelClass === forModel);
    if (!modelActions) {
      this.modelActions.push({ actions: actions, modelClass: forModel });
    } else {
      for (const action of actions) {
        if (modelActions.actions.find((a) => a.constructor.name === action.constructor.name)) {
          throw new Error(`Action "${action.constructor.name}" already registered for model "${forModel.name}"!`);
        }
        modelActions.actions.push(action);
      }
    }
  }

  /**
   * @internal
   */
  @EventSource(ModelActionRegistrationEvent)
  registerOverlayActions(forOverlay: Constructable<UnknownOverlay>, actions: IUnknownModelAction[]): void {
    const overlayActions = this.overlayActions.find((a) => a.overlayClass === forOverlay);
    if (!overlayActions) {
      this.overlayActions.push({ actions: actions, overlayClass: forOverlay });
    } else {
      for (const action of actions) {
        if (overlayActions.actions.find((a) => a.constructor.name === action.constructor.name)) {
          throw new Error(`Action "${action.constructor.name}" already registered for overlay "${forOverlay.name}"!`);
        }
        overlayActions.actions.push(action);
      }
    }
  }

  /**
   * @internal
   */
  @EventSource(ResourceActionRegistrationEvent)
  registerResourceActions(forResource: Constructable<UnknownResource>, actions: IUnknownResourceAction[]): void {
    if (forResource.prototype instanceof ATerraformResource) {
      throw new TransactionError(
        `Cannot register resource actions for terraform resource "${forResource.name}"! ` +
          'Terraform resources are managed by terraform via toHCL().',
      );
    }

    const resourceActions = this.resourceActions.find((a) => a.resourceClass === forResource);
    if (!resourceActions) {
      this.resourceActions.push({ actions: actions, resourceClass: forResource });
    } else {
      for (const action of actions) {
        if (resourceActions.actions.find((a) => a.constructor.name === action.constructor.name)) {
          throw new Error(`Action "${action.constructor.name}" already registered for resource "${forResource.name}"!`);
        }
        resourceActions.actions.push(action);
      }
    }
  }

  /**
   * @internal
   */
  unregisterModelActions(forModel: Constructable<UnknownModel>): void {
    const modelActions = this.modelActions.find((a) => a.modelClass === forModel);
    if (!modelActions) {
      return;
    }

    modelActions.actions = [];
  }

  /**
   * @internal
   */
  unregisterOverlayActions(forOverlay: Constructable<UnknownOverlay>): void {
    const overlayActions = this.overlayActions.find((a) => a.overlayClass === forOverlay);
    if (!overlayActions) {
      return;
    }

    overlayActions.actions = [];
  }

  /**
   * @internal
   */
  private async applyModels(diffs: DiffMetadata[]): Promise<DiffMetadata[][]> {
    const transaction: DiffMetadata[][] = [];

    let currentApplyOrder = 0;
    let processed = 0;

    while (processed < diffs.length) {
      const diffsInSameLevel = diffs.filter((d) => d.applyOrder === currentApplyOrder);
      const diffsProcessedInSameLevel: DiffMetadata[] = [];

      for (const diff of diffsInSameLevel) {
        if (diff.applied) {
          continue;
        }

        // Check for duplicate diffs on the same model and same field.
        const duplicateDiffs = this.getDuplicateDiffs(diff, diffsInSameLevel);

        // Only process the first diff, given all duplicate diffs are the same.
        const diffToProcess = duplicateDiffs[0].diff;

        for (const a of diff.actions as IUnknownModelAction[]) {
          // Find moduleId.
          const moduleId =
            diff.node instanceof AOverlay
              ? this.inputService.getModuleIdFromOverlay(diff.node)
              : this.inputService.getModuleIdFromModel(diff.node as UnknownModel);
          if (moduleId === undefined) {
            throw new TransactionError(`Node "${diff.node.getContext()}" is not associated with any module!`);
          }

          // Resolve all keys of the module - inputs keys and nodes generated by the module keys.
          const inputs: ActionInputs = { inputs: {}, metadata: {}, models: {}, overlays: {}, resources: {} };
          const inputKeys = this.moduleContainer.getModuleInstanceInputKeys(moduleId).map((i) => {
            return `${moduleId}.input.${i}`;
          });
          const metadataKeys = this.inputService.getMetadataKeys(moduleId);
          const nodeKeys = this.inputService.getAllNodeKeys(moduleId);
          const allKeys = [...inputKeys, ...metadataKeys, ...nodeKeys];

          for (const k of allKeys) {
            const inputValue = this.inputService.resolve(k);
            if (inputValue === undefined) {
              throw new InputNotFoundTransactionError(
                'No matching input found to process action!',
                a,
                diffToProcess,
                k,
              );
            }

            const keyValue = k.split('.')[2];
            if (k.startsWith(`${moduleId}.input`)) {
              inputs.inputs[keyValue] = inputValue;
            } else if (k.startsWith(`${moduleId}.metadata`)) {
              inputs.metadata[keyValue] = inputValue;
            } else if (k.startsWith(`${moduleId}.model`)) {
              inputs.models[keyValue] = inputValue as UnknownModel;
            } else if (k.startsWith(`${moduleId}.overlay`)) {
              inputs.overlays[keyValue] = inputValue as UnknownOverlay;
            } else if (k.startsWith(`${moduleId}.resource`)) {
              inputs.resources[keyValue] = inputValue as UnknownResource;
            }
          }

          // Apply all actions on the diff in the scope of the node, then update diff metadata with inputs and outputs.
          const outputs = await AResource.runInScope(this.getResourceScope(diffToProcess.node as UnknownModel), () =>
            a.handle(diffToProcess, inputs, {}),
          );
          for (const resource of Object.values(outputs)) {
            const moduleId =
              diffToProcess.node instanceof AOverlay
                ? this.inputService.getModuleIdFromOverlay(diffToProcess.node)
                : this.inputService.getModuleIdFromModel(diffToProcess.node as UnknownModel);
            if (moduleId === undefined) {
              throw new TransactionError(
                `Node "${diffToProcess.node.getContext()}" is not associated with any module!`,
              );
            }

            // A resource already in the graph is one the action changed, not created: it keeps the module
            // that created it, and that module's tags.
            const existingResource = this.resourceDataRepository.getNewResourceByContext(resource.getContext());
            if (existingResource && existingResource !== resource) {
              throw new TransactionError(
                `Resource "${resource.getContext()}" already exists, and action "${a.constructor.name}" created it again!`,
              );
            } else if (existingResource) {
              continue;
            }

            // Set resource tags.
            const resourceTags = this.inputService.resolve(`${moduleId}.tag.${resource.getContext()}`) as {
              [key: string]: string;
            };
            for (const [key, value] of Object.entries(resourceTags)) {
              resource.tags[key] = value;
            }

            this.resourceDataRepository.addNewResource(resource);
            this.inputService.registerResource(moduleId, resource);
          }

          duplicateDiffs.forEach((d) => {
            d.updateInputs(inputs);
            d.updateOutputs(outputs);
          });

          this.eventService.emit(new ModelActionTransactionEvent(a.constructor.name));
        }

        // Include the diff to process in the list of diffs processed in the same level.
        diffsProcessedInSameLevel.push(duplicateDiffs[0]);

        // Mark metadata of each duplicate diffs as applied.
        duplicateDiffs.forEach((d) => (d.applied = true));
      }

      // Add all diff in same level to transaction.
      transaction.push(diffsProcessedInSameLevel);

      processed += diffsInSameLevel.length;
      currentApplyOrder += 1;
    }

    return transaction;
  }

  /**
   * @internal
   */
  private async applyResources(
    diffs: DiffMetadata[],
    { skipActualResourceUpdate = false }: { skipActualResourceUpdate?: boolean } = {},
  ): Promise<DiffMetadata[][]> {
    const transaction: DiffMetadata[][] = [];
    const validationErrors: Error[] = [];

    let currentApplyOrder = 0;
    let processed = 0;

    while (processed < diffs.length) {
      const diffsInSameLevel = diffs.filter((d) => d.applyOrder === currentApplyOrder);
      const diffsProcessedInSameLevel: DiffMetadata[] = [];

      for (const diff of diffsInSameLevel) {
        if (diff.applied) {
          continue;
        }

        // Check for duplicate diffs on the same resource and same field.
        const duplicateDiffs = this.getDuplicateDiffs(diff, diffsInSameLevel);

        // Only process the first diff, given all duplicate diffs are the same.
        const diffToProcess = duplicateDiffs[0].diff;

        for (const a of diff.actions as IUnknownResourceAction[]) {
          this.eventService.emit(new ResourceActionInitiatedTransactionEvent(a.constructor.name, diff));

          // Captured before `handle()` mutates the resource, for the summary event below.
          const preHandleSynth = skipActualResourceUpdate
            ? this.resourceDataRepository.getNewResourceByContext(diffToProcess.node.getContext())?.synth()
            : undefined;

          let actionTimeoutId: NodeJS.Timeout | undefined;
          try {
            await Promise.race([
              new Promise<void>(async (resolve, reject) => {
                try {
                  const response = await a.handle(diffToProcess);
                  this.resourceDataRepository
                    .getNewResourceByContext(diffToProcess.node.getContext())
                    ?.setResponse(response);
                  resolve();
                } catch (error) {
                  if (diffToProcess.action === DiffAction.VALIDATE) {
                    validationErrors.push(error);
                    resolve();
                  } else {
                    reject(
                      new ResourceActionExceptionTransactionError(
                        error.message,
                        error,
                        diffToProcess,
                        a.constructor.name,
                      ),
                    );
                  }
                }
              }),
              new Promise(
                (_resolve, reject) =>
                  (actionTimeoutId = setTimeout(() => {
                    reject(
                      new ResourceActionTimeoutTransactionError(
                        `Resource action ${a.constructor.name} timed out after ${a.actionTimeoutInMs || 90000}ms!`,
                        diffToProcess,
                        a.constructor.name,
                      ),
                    );
                  }, a.actionTimeoutInMs || 90000)), // 1.5 minutes.
              ),
            ]);
          } finally {
            if (actionTimeoutId) {
              clearTimeout(actionTimeoutId);
            }
          }

          if (skipActualResourceUpdate) {
            // Stateless invocation (run-action): the actual resource graph is not maintained;
            // terraform state is the source of truth until the next commit. The summary is therefore
            // derived from the new-graph resource either side of `handle()`.
            const postHandleSynth =
              diffToProcess.action === DiffAction.DELETE && diffToProcess.field === 'resourceId'
                ? {}
                : this.resourceDataRepository.getNewResourceByContext(diffToProcess.node.getContext())?.synth();

            this.eventService.emit(
              new ResourceActionSummaryTransactionEvent(a.constructor.name, {
                diff,
                values: { current: postHandleSynth ?? {}, previous: preHandleSynth ?? {} },
              }),
            );
            this.eventService.emit(new ResourceActionCompletedTransactionEvent(a.constructor.name, diff));
            continue;
          }

          // De-reference from actual resources. The lookup can miss when a diff references a resource
          // this transaction has not applied yet, so name what is missing rather than letting
          // `undefined` surface as a TypeError several frames away.
          const deReferenceResource = async (context: string): Promise<UnknownResource> => {
            const referencedResource = this.resourceDataRepository.getActualResourceByContext(context);
            if (!referencedResource) {
              throw new TransactionError(
                `Cannot apply "${diffToProcess.action}" on field "${String(diffToProcess.field)}" of resource ` +
                  `"${diffToProcess.node.getContext()}": it references "${context}", which is not in the actual ` +
                  'resource graph yet. The referenced resource is applied later in this transaction, or not at all.',
              );
            }
            return referencedResource;
          };

          // Incrementally apply diff inverse to the respective actual resource.
          let actualResource = this.resourceDataRepository.getActualResourceByContext(diffToProcess.node.getContext());
          if (!actualResource) {
            actualResource = await AResource.cloneResource(diffToProcess.node as UnknownResource, deReferenceResource);
            this.resourceDataRepository.addActualResource(actualResource);
            this.eventService.emit(
              new ResourceActionSummaryTransactionEvent(a.constructor.name, {
                diff,
                values: { current: actualResource.synth(), previous: {} },
              }),
            );
          } else {
            const previousSynth = actualResource.synth();
            await actualResource.diffInverse(diffToProcess, deReferenceResource);
            this.eventService.emit(
              new ResourceActionSummaryTransactionEvent(a.constructor.name, {
                diff,
                values: {
                  current: actualResource.isMarkedDeleted() ? {} : actualResource.synth(),
                  previous: previousSynth,
                },
              }),
            );
          }

          this.eventService.emit(new ResourceActionCompletedTransactionEvent(a.constructor.name, diff));
        }

        // Include the diff to process in the list of diffs processed in the same level.
        diffsProcessedInSameLevel.push(duplicateDiffs[0]);

        // Mark metadata of each duplicate diffs as applied.
        duplicateDiffs.forEach((d) => (d.applied = true));
      }

      // Add all diff in same level to transaction.
      transaction.push(diffsProcessedInSameLevel);

      processed += diffsInSameLevel.length;
      currentApplyOrder += 1;
    }

    if (validationErrors.length > 0) {
      throw new ValidationTransactionError('Validation failed on resources!', {
        errors: validationErrors.map((error) => ({
          constraint: 'Resource Validation',
          type: ValidationType.CUSTOM,
          value: error.message,
        })),
        pass: false,
      });
    }

    return transaction;
  }

  /**
   * Refuses two names the `uniqueProperties` of one resource class say must differ: two values of its path,
   * from two resources or from one, sharing the values of its domain.
   */
  private ensureUniqueNames(resources: UnknownResource[]): void {
    const describeResource = (resource: UnknownResource): string =>
      `resource "${resource.getContext()}" of module "${this.inputService.getModuleIdFromResource(resource)}"`;

    const holders = new Map<string, UnknownResource>();
    for (const resource of resources) {
      for (const uniqueName of this.getUniqueNames(resource)) {
        const holder = holders.get(uniqueName.key);
        if (holder) {
          const domainName = uniqueName.within.length > 0 ? `within ${uniqueName.within.join(', ')}` : 'across the app';
          throw new TransactionError(
            `"${uniqueName.path}" "${uniqueName.name}" is not unique ${domainName}: ${describeResource(holder)} and ${describeResource(resource)} both use it!`,
          );
        }
        holders.set(uniqueName.key, resource);
      }
    }
  }

  /**
   * Contributes every resource in the new (desired) resource graph to the shared
   * {@link TerraformService}: terraform resources via `toHCL()`, external resources via
   * `addOctoTerraformExternalResource()`. Always processes the full desired state — terraform
   * computes the actual create/update/delete against its own state.
   *
   * Order does not matter: terraform resources reference each other through deferred refs, and
   * external resources defer their parent-input wiring — both are resolved later, once every
   * resource is registered (see {@link TerraformService}'s wiring phase).
   */
  private async generateTerraform(): Promise<void> {
    const resources = this.resourceDataRepository.getNewResourcesByProperties().filter((r) => !r.isMarkedDeleted());

    this.ensureUniqueNames(resources);

    for (const resource of resources) {
      // Every resource is produced by a model action inside a module, so it is always module-bound.
      // A missing attribution means the resource was registered out-of-band — a hard error.
      const moduleId = this.inputService.getModuleIdFromResource(resource);
      if (moduleId === undefined) {
        throw new TransactionError(`Resource "${resource.resourceId}" is not associated with any module!`);
      }

      const scope = this.terraformService.scope(moduleId);
      if (resource instanceof ATerraformResource) {
        await resource.toHCL(scope);
      } else {
        scope.addOctoTerraformExternalResource(resource);
      }
    }

    this.moveRenamedResources(resources);
  }

  /**
   * @internal
   */
  private getDiffsOfSameNode(diff: DiffMetadata, diffs: DiffMetadata[], diffAction: DiffAction): DiffMetadata[] {
    return diffs.filter((d) => d.node.getContext() === diff.node.getContext() && d.action === diffAction);
  }

  /**
   * @internal
   */
  private getDuplicateDiffs(diff: DiffMetadata, diffs: DiffMetadata[]): DiffMetadata[] {
    return diffs.filter(
      (d) =>
        d.node.getContext() === diff.node.getContext() &&
        d.field === diff.field &&
        d.action === diff.action &&
        DiffUtility.isObjectDeepEquals(d.value, diff.value),
    );
  }

  /**
   * @internal
   */
  private getMatchingDiffs(diff: DiffMetadata, diffs: DiffMetadata[]): DiffMetadata[] {
    return diffs.filter(
      (d) =>
        d.node.getContext() === diff.node.getContext() &&
        d.field === diff.field &&
        DiffUtility.isObjectDeepEquals(d.value, diff.value),
    );
  }

  /**
   * The scope of the resources a node's actions create: the models the node sits under. An overlay
   * sits where the nodes its own module created sit; the nodes it borrows from other modules are what
   * it joins, so joining one more never moves what it created. An overlay joining only borrowed nodes
   * sits where all of them sit. A model another member sits under is left out, since that member's
   * context already names it.
   */
  private getResourceScope(node: UnknownModel | UnknownOverlay): string[] {
    const members = new Map<string, UnknownModel>();
    const placedNodeContexts = new Set<string>();
    const collectMembers = (placedNode: UnknownModel | UnknownOverlay): void => {
      if (placedNodeContexts.has(placedNode.getContext())) {
        return;
      }
      placedNodeContexts.add(placedNode.getContext());

      if (placedNode instanceof AOverlay) {
        const moduleId = this.inputService.getModuleIdFromOverlay(placedNode);
        const joinedNodes = placedNode
          .getAnchors()
          .map((anchor) => (anchor instanceof MatchingAnchor ? anchor.getActual().getParent() : anchor.getParent()));
        const ownNodes = joinedNodes.filter(
          (joinedNode) =>
            moduleId !== undefined &&
            (joinedNode instanceof AOverlay
              ? this.inputService.getModuleIdFromOverlay(joinedNode)
              : this.inputService.getModuleIdFromModel(joinedNode)) === moduleId,
        );
        for (const placingNode of ownNodes.length > 0 ? ownNodes : joinedNodes) {
          collectMembers(placingNode);
        }
        return;
      }
      for (const dependency of Object.values(placedNode.getParents()).flat()) {
        members.set(dependency.to.getContext(), dependency.to as UnknownModel);
      }
    };
    collectMembers(node);

    // Find every model the members sit under.
    const ancestorContexts = new Set<string>();
    const collectAncestors = (model: UnknownModel): void => {
      for (const dependency of Object.values(model.getParents()).flat()) {
        if (!ancestorContexts.has(dependency.to.getContext())) {
          ancestorContexts.add(dependency.to.getContext());
          collectAncestors(dependency.to as UnknownModel);
        }
      }
    };
    for (const member of members.values()) {
      collectAncestors(member);
    }

    return [...members.keys()].filter((context) => !ancestorContexts.has(context)).sort();
  }

  /**
   * The names a resource holds that the `uniqueProperties` of its class say the provider keeps unique,
   * each keyed by its class, path and domain. A path with no value holds no name.
   */
  private getUniqueNames(resource: UnknownResource): { key: string; name: unknown; path: string; within: string[] }[] {
    const resourceClass = resource.constructor as typeof AResource;
    const uniqueNames: { key: string; name: unknown; path: string; within: string[] }[] = [];

    for (const { path, within } of resourceClass.UNIQUE_PROPERTIES ?? []) {
      // Resolve every name at the path, skipping a branch with no value.
      let names: unknown[] = [resource.properties];
      for (const segment of path.split('.')) {
        const isArray = segment.endsWith('[]');
        const key = isArray ? segment.slice(0, -2) : segment;
        names = names.flatMap((value) => {
          const child = (value as Record<string, unknown> | undefined)?.[key];
          if (child === undefined || child === null) {
            return [];
          }
          return isArray ? (child as unknown[]) : [child];
        });
      }
      if (names.length === 0) {
        continue;
      }

      // Resolve the domain, which every named resource must have.
      const domain = within.map((property) => {
        const value = resource.properties[property];
        if (value === undefined || value === null) {
          throw new TransactionError(
            `resource "${resource.getContext()}" of module "${this.inputService.getModuleIdFromResource(resource)}" has no "${property}", which its "${path}" is unique within!`,
          );
        }
        return value;
      });

      for (const name of names) {
        const key = JSON.stringify([resourceClass.NODE_PACKAGE, resourceClass.NODE_NAME, path, ...domain, name]);
        uniqueNames.push({ key, name, path, within });
      }
    }

    return uniqueNames;
  }

  /**
   * Hands each deleted resource's terraform state to the added resource of its class that takes one of
   * its names, so the two are one piece of infrastructure, updated or replaced in place. Without it
   * terraform creates the added resource while the deleted one still holds the name, and the provider
   * refuses. External resources are left out: octo runs their actions itself, and a move would skip them.
   */
  private moveRenamedResources(resources: UnknownResource[]): void {
    const actualResources = this.resourceDataRepository.getActualResourcesByProperties();
    const actualContexts = new Set(actualResources.map((r) => r.getContext()));
    const newContexts = new Set(resources.map((r) => r.getContext()));

    // Index the names of every deleted terraform resource.
    const deletedResourcesByName = new Map<string, UnknownResource>();
    for (const resource of actualResources) {
      if (!(resource instanceof ATerraformResource) || newContexts.has(resource.getContext())) {
        continue;
      }
      for (const { key } of this.getUniqueNames(resource)) {
        deletedResourcesByName.set(key, resource);
      }
    }
    if (deletedResourcesByName.size === 0) {
      return;
    }

    // Pair each added terraform resource with the deleted resource holding one of its names.
    const takenBy = new Map<UnknownResource, UnknownResource>();
    for (const resource of resources) {
      if (!(resource instanceof ATerraformResource) || actualContexts.has(resource.getContext())) {
        continue;
      }

      const deletedResources = [
        ...new Set(
          this.getUniqueNames(resource)
            .map(({ key }) => deletedResourcesByName.get(key))
            .filter((r): r is UnknownResource => r !== undefined),
        ),
      ];
      if (deletedResources.length === 0) {
        continue;
      }
      if (deletedResources.length > 1) {
        throw new TransactionError(
          `Resource "${resource.getContext()}" takes the names of both "${deletedResources[0].getContext()}" and "${deletedResources[1].getContext()}", and can take over only one of them!`,
        );
      }

      const [deletedResource] = deletedResources;
      const otherResource = takenBy.get(deletedResource);
      if (otherResource) {
        throw new TransactionError(
          `Resources "${otherResource.getContext()}" and "${resource.getContext()}" both take a name of "${deletedResource.getContext()}", and only one can take it over!`,
        );
      }
      takenBy.set(deletedResource, resource);

      // Terraform moves state only within one folder.
      const moduleId = this.inputService.getModuleIdFromResource(resource)!;
      const deletedModuleId = this.resourceSerializationService.getActualResourceModuleId(deletedResource);
      if (deletedModuleId !== undefined && deletedModuleId !== moduleId) {
        throw new TransactionError(
          `Resource "${resource.getContext()}" of module "${moduleId}" takes a name of "${deletedResource.getContext()}" of module "${deletedModuleId}", and terraform cannot move infrastructure between module folders! Delete one in an apply, and add the other in the next.`,
        );
      }

      this.terraformService.moveResource(moduleId, deletedResource.resourceId, resource.resourceId);
    }
  }

  /**
   * Before assigning order to a diff, all its node's parent diffs must be processed.
   * E.g. diff to add environment, depends on region to exist, thus add region diff gets processed first.
   */
  private setApplyOrder(diff: DiffMetadata, diffs: DiffMetadata[], seen: DiffMetadata[] = []): void {
    // Detect circular dependencies.
    if (this.getDuplicateDiffs(diff, seen).length > 0) {
      throw new TransactionError('Found circular dependencies!');
    }

    // Detect conflicting actions in transaction.
    const matchingDiffs = this.getMatchingDiffs(diff, diffs);
    const diffActions = matchingDiffs.reduce((accumulator, currentValue) => {
      accumulator[currentValue.action] = true;
      return accumulator;
    }, {});
    if (diffActions[DiffAction.ADD] && diffActions[DiffAction.DELETE]) {
      throw new TransactionError('Found conflicting actions in same transaction!');
    }

    // Skip processing diff that already has the applyOrder set.
    if (diff.applyOrder >= 0) {
      return;
    }

    // Get all dependencies of subject node.
    const dependencies = diff.node.getDependencies();
    const dependencyApplyOrders: number[] = [-1];

    for (const dependency of dependencies) {
      // Iterate diffs looking to match dependency on same field and action.
      const matchingParentDiffs = diffs.filter(
        (d) =>
          d.node.getContext() === dependency.to.getContext() &&
          dependency.hasMatchingBehavior(diff.field, diff.action, d.field, d.action),
      );

      // On each diff that should be processed first, apply order on it before than self.
      for (const matchingParentDiff of matchingParentDiffs) {
        this.setApplyOrder(matchingParentDiff, diffs, [...seen, diff]);
        dependencyApplyOrders.push(matchingParentDiff.applyOrder);
      }
    }

    // Get diffs of same node.
    // Process ADD before UPDATE/REPLACE, and UPDATE/REPLACE before DELETE. A REPLACE recreates the
    // resource in place (same context), so for ordering it behaves like an UPDATE.
    if (diff.action === DiffAction.UPDATE || diff.action === DiffAction.REPLACE) {
      const diffsOfSameNodeWithAddAction = this.getDiffsOfSameNode(diff, diffs, DiffAction.ADD);
      for (const sameNodeDiffWithAddAction of diffsOfSameNodeWithAddAction) {
        this.setApplyOrder(sameNodeDiffWithAddAction, diffs, [...seen, diff]);
        dependencyApplyOrders.push(sameNodeDiffWithAddAction.applyOrder);
      }
    } else if (diff.action === DiffAction.DELETE) {
      const diffsOfSameNodeWithUpdateAction = this.getDiffsOfSameNode(diff, diffs, DiffAction.UPDATE);
      for (const sameNodeDiffWithUpdateAction of diffsOfSameNodeWithUpdateAction) {
        this.setApplyOrder(sameNodeDiffWithUpdateAction, diffs, [...seen, diff]);
        dependencyApplyOrders.push(sameNodeDiffWithUpdateAction.applyOrder);
      }
    }

    diff.applyOrder = Math.max(...dependencyApplyOrders) + 1;
  }
}

/**
 * @internal
 */
@Factory<TransactionService>(TransactionService)
export class TransactionServiceFactory {
  private static instance: TransactionService;

  /**
   * @internal
   */
  static async create(): Promise<TransactionService> {
    const container = Container.getInstance();
    const [
      eventService,
      inputService,
      moduleContainer,
      overlayDataRepository,
      resourceDataRepository,
      resourceSerializationService,
      terraformService,
    ] = await Promise.all([
      container.get(EventService),
      container.get(InputService),
      container.get(ModuleContainer),
      container.get(OverlayDataRepository),
      container.get(ResourceDataRepository),
      container.get(ResourceSerializationService),
      container.get(TerraformService),
    ]);

    if (!this.instance) {
      this.instance = new TransactionService(
        eventService,
        inputService,
        moduleContainer,
        overlayDataRepository,
        resourceDataRepository,
        resourceSerializationService,
        terraformService,
      );
    }

    return this.instance;
  }
}
