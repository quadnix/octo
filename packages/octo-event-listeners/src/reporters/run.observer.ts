import type { CommitModeCompletedEvent, DiffMetadata, ModeStartedEvent, ValidateModeCompletedEvent } from '@quadnix/octo';
import { buildReport } from './report.builder.js';
import type { OctoReport, RunObservation } from './report.model.js';

/**
 * Collects one run from octo's event stream, and turns it into a report.
 *
 * Held by each listener that reports, rather than shared between them: listeners are dispatched in
 * no guaranteed order, so a single instance read by one listener and written by another would race.
 * Two instances see the same events and build the same report, which is what lets the terminal and
 * the HTML page agree without being coupled to each other.
 */
export class RunObserver {
  /**
   * The most recent model transaction, kept across mode boundaries.
   *
   * The transaction is not always built inside a mode: a single-process driver (`runModules`) builds
   * it once and hands the same result to generate/validate/commit, so the event fires *before* the
   * first mode starts. Resetting per mode dropped the intent layer from every report that path
   * produced, leaving reports that could only name modules.
   */
  private lastModelTransaction: RunObservation['modelTransaction'] = [];
  private observation: RunObservation | undefined;
  /**
   * Terraform time since the last report. Counted outside the observation for the same reason as the
   * transaction: terraform runs *between* modes. Both the CLI and `runModules` plan first and pass
   * the result into `octo.validate()`, so every command lands before the mode starts, and the mode's
   * own duration excludes all of it.
   */
  private terraformInMs = 0;

  commitCompleted(payload: CommitModeCompletedEvent['payload']): void {
    if (this.observation) {
      this.observation.commit = payload;
    }
  }

  /**
   * Closes the current run and returns its report, or `undefined` when this mode produces none —
   * `generate` and `run-action` report nothing, and a mode that never started has nothing to close.
   */
  finish({ durationInMs, error }: { durationInMs: number; error?: string }): OctoReport | undefined {
    const observation = this.observation;
    this.observation = undefined;

    if (!observation || (observation.mode !== 'commit' && observation.mode !== 'validate')) {
      return undefined;
    }

    observation.durationInMs = durationInMs;
    observation.error = error;
    observation.terraformInMs = this.terraformInMs;
    this.terraformInMs = 0;

    return buildReport(observation);
  }

  modelTransaction(payload: DiffMetadata[][]): void {
    this.lastModelTransaction = payload;
    if (this.observation) {
      this.observation.modelTransaction = payload;
    }
  }

  modeStarted(payload: ModeStartedEvent['payload']): void {
    this.observation = {
      appName: payload.appName,
      mode: payload.mode,
      // Carried over: the transaction describes the intent this run is acting on, whether it was
      // published inside this mode or before it.
      modelTransaction: this.lastModelTransaction,
      startedAt: Date.now(),
    };
  }

  terraformCommandFinished(durationInMs: number): void {
    this.terraformInMs += durationInMs;
  }

  validateCompleted(report: ValidateModeCompletedEvent['payload']['report']): void {
    if (this.observation) {
      this.observation.validate = report;
    }
  }
}
