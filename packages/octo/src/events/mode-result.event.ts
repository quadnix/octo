import type { AggregatedResourceAction } from '../functions/diff/aggregate-resource-actions.js';
import type { ValidateReport } from '../modes/validate.mode.js';
import { Event } from './event.model.js';

/**
 * The ModeResultEvent class is the superclass for all events carrying what a mode concluded.
 *
 * @group Events/ModeResult
 */
export abstract class ModeResultEvent<T> extends Event<T> {}

/**
 * This event is emitted when `validate` has correlated terraform's plans with octo's intent.
 * The payload is the {@link ValidateReport} that `validate` returns to its caller.
 *
 * @group Events/ModeResult
 */
export class ValidateModeCompletedEvent extends ModeResultEvent<{ report: ValidateReport }> {}

/**
 * This event is emitted when `run-action` has run, or found no need to run, the action of one
 * external resource.
 *
 * @group Events/ModeResult
 */
export class RunActionModeCompletedEvent extends ModeResultEvent<{
  /**
   * What became of the resource. `noop` means its action did not run.
   */
  action: 'add' | 'delete' | 'noop' | 'update';

  /**
   * The resource whose response a `taken-from-predecessor` noop took.
   */
  predecessorResourceId?: string;

  /**
   * Why a `noop` ran nothing: nothing changed since the last commit, an earlier call already ran the
   * action for these inputs, or a renamed resource with its predecessor's properties took that
   * response. Absent for any other action.
   */
  reason?: 'already-done' | 'taken-from-predecessor' | 'unchanged';

  resourceId: string;
}> {}

/**
 * This event is emitted when `commit` has recorded a terraform apply back into octo state.
 *
 * @group Events/ModeResult
 */
export class CommitModeCompletedEvent extends ModeResultEvent<{
  /**
   * Modules whose folders were written without resources, because they left intent.
   */
  emptiedModuleIds: string[];

  /**
   * Each octo resource this commit applied, with the terraform addresses it renders now, the ones
   * the last commit recorded for it, and those of its addresses terraform's state holds unchanged
   * since. Carries no terraform actions - `commit` runs after the apply, so it has no plan to read.
   */
  resources: {
    action: AggregatedResourceAction['action'];
    moduleId?: string;
    previousTerraformAddresses: string[];
    reason?: string;
    resourceContext: string;
    resourceId: string;
    terraformAddresses: string[];
    unchangedTerraformAddresses: string[];
  }[];

  /**
   * Every response key written onto a resource from a terraform output, with the value it replaced.
   */
  responses: { key: string; previousValue?: string; resourceContext: string; value: string }[];

  warnings: { message: string; moduleId?: string }[];
}> {}
