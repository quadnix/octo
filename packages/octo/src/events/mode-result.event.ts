import type { AggregatedResourceAction } from '../functions/diff/aggregate-resource-actions.js';
import type { ValidateReport } from '../modes/validate.mode.js';
import { Event } from './event.model.js';

/**
 * The ModeResultEvent class is the superclass for all events carrying what a mode concluded.
 *
 * @group Events/ModeResult
 */
export class ModeResultEvent<T> extends Event<T> {}

/**
 * This event is emitted when `validate` has correlated terraform's plans with octo's intent.
 * The payload is the {@link ValidateReport} that `validate` returns to its caller.
 *
 * @group Events/ModeResult
 */
export class ValidateModeCompletedEvent extends ModeResultEvent<{ report: ValidateReport }> {}

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
   * Each octo resource this commit applied, with the terraform addresses it renders.
   * Carries no terraform actions - `commit` runs after the apply, so it has no plan to read.
   */
  resources: {
    action: AggregatedResourceAction['action'];
    moduleId?: string;
    reason?: string;
    resourceContext: string;
    resourceId: string;
    terraformAddresses: string[];
  }[];

  /**
   * Every response key written onto a resource from a terraform output, with the value it replaced.
   */
  responses: { key: string; previousValue?: string; resourceContext: string; value: string }[];

  warnings: { message: string; moduleId?: string }[];
}> {}
