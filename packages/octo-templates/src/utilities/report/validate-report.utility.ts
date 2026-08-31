import type { TestModuleContainer } from '@quadnix/octo';

type ValidateReport = NonNullable<
  (TestModuleContainer['runModules'] extends (...args: never[]) => AsyncGenerator<infer TYield>
    ? TYield
    : never)['validateReport']
>;

/**
 * A validate report reduced to the parts octo decides, for a snapshot taken from a live run.
 *
 * The report is half octo's and half the provider's: which resources changed and which terraform
 * addresses moved are octo's, while the values inside those changes are whatever AWS handed out on
 * the run. A snapshot of the whole thing pins both, so a suite breaks whenever infrastructure is
 * recreated, and the fix is a redaction rule per shape of value - which cannot converge, because a
 * list that comes back in a different order has no shape to match.
 *
 * So the values are dropped and everything else is kept. A changed argument is named and not
 * valued: `revision` moving is the signal, `13 → 15` is the noise.
 *
 * @group Utilities/Report
 */
export class ValidateReportUtility {
  /**
   * Returns `report` with every value the provider mints removed.
   *
   * Two places carry one. A terraform change lists the arguments that moved with both sides, which
   * becomes the sorted list of argument names. A failure carries terraform's own message, which is
   * the run's text rather than octo's, and is dropped to the module it belongs to.
   *
   * Everything else - the octo action per resource, the terraform addresses, the actions terraform
   * plans on them, drift, uncertain, attributed changes, notes, and the report's confidence - is
   * rendered from names octo generates and is the same on every run.
   */
  static summarize(report: ValidateReport): Record<string, unknown> {
    return {
      attributedChanges: report.attributedChanges,
      confidence: report.confidence,
      drift: report.drift,
      failures: report.failures.map((failure) => ({ moduleId: failure.moduleId })),
      intentChanges: report.intentChanges.map((intentChange) => ({
        ...intentChange,
        terraformChanges: intentChange.terraformChanges.map((terraformChange) => ({
          address: terraformChange.address,
          changedFields: terraformChange.changedFields.map((changedField) => changedField.field).sort(),
          tfActions: terraformChange.tfActions,
        })),
      })),
      notes: report.notes,
      uncertain: report.uncertain,
    };
  }
}
