import type { TestModuleContainer } from '@quadnix/octo';
import { RedactionUtility } from './redaction.utility.js';

/**
 * Terraform fields whose value the provider mints, and which carry nothing a snapshot should hold.
 *
 * A counter has no shape an identifier rule could match - an ECS task definition `revision` is the
 * string `13`, indistinguishable from any other number - so it is named by the field it sits in. The
 * revision of a family never resets, so every run that registers one moves it.
 */
const PROVIDER_ASSIGNED_FIELDS = new Set(['revision']);

/**
 * What stands in for a provider-assigned field's value.
 */
const PROVIDER_ASSIGNED_TOKEN = '<assigned>';

type ValidateReport = NonNullable<
  (TestModuleContainer['runModules'] extends (...args: never[]) => AsyncGenerator<infer TYield>
    ? TYield
    : never)['validateReport']
>;

/**
 * Replaces provider-assigned identifiers in a validate report with an alias naming the resource that
 * owns them.
 *
 * A report captured from a live plan carries whatever identifiers the provider handed out on that
 * run, so a committed snapshot of one breaks the moment the infrastructure is recreated. An alias is
 * derived from the terraform address octo renders, which is the same on every run.
 *
 * Which values count is the identifier rules of
 * [RedactionUtility](./redaction.utility.ts), so a new cloud is a rule file rather than a change
 * here. Aliasing is all-or-nothing: an identifier this utility cannot name throws rather than
 * reaching a snapshot, so a resource kind it has never seen fails the test instead of leaking.
 *
 * A value the provider mints with no shape to match on is handled by the field that holds it
 * instead. See {@link PROVIDER_ASSIGNED_FIELDS}.
 */
export class ResourceAliasUtility {
  /**
   * Returns a copy of `report` with every provider-assigned identifier replaced by its alias.
   *
   * @throws If the report holds an identifier that no terraform address claims.
   */
  static alias(report: ValidateReport): ValidateReport {
    const blanked = ResourceAliasUtility.blankProviderAssignedFields(report);
    const aliases = ResourceAliasUtility.buildAliases(blanked);

    // Replace the longest identifiers first, so one that contains another cannot be half-substituted.
    const literals = [...aliases.keys()].sort((a, b) => b.length - a.length);
    const aliased = ResourceAliasUtility.mapStrings(blanked, (text) =>
      literals.reduce((substituted, literal) => substituted.split(literal).join(aliases.get(literal)!), text),
    );

    // Refuse to hand back a report that still names live infrastructure.
    const leaked = new Set<string>();
    ResourceAliasUtility.mapStrings(aliased, (text) => {
      ResourceAliasUtility.findCandidates(text).forEach((candidate) => leaked.add(candidate));
      return text;
    });
    if (leaked.size > 0) {
      throw new Error(
        `Validate report holds an identifier that no terraform address claims: ${[...leaked].sort().join(', ')}!`,
      );
    }

    return aliased;
  }

  /**
   * Returns a copy of `report` with every {@link PROVIDER_ASSIGNED_FIELDS} value replaced by a token.
   *
   * A value the report composed rather than read - an empty string, or a `(known after apply)` kind
   * of note - is left alone: it says what the plan will do, and is the same on every run.
   */
  private static blankProviderAssignedFields(report: ValidateReport): ValidateReport {
    const blank = (value: string | undefined): string | undefined =>
      value === undefined || value === '' || value.startsWith('(') ? value : PROVIDER_ASSIGNED_TOKEN;

    return {
      ...report,
      intentChanges: report.intentChanges.map((intentChange) => ({
        ...intentChange,
        terraformChanges: intentChange.terraformChanges.map((terraformChange) => ({
          ...terraformChange,
          changedFields: terraformChange.changedFields.map((changedField) =>
            PROVIDER_ASSIGNED_FIELDS.has(changedField.field)
              ? { ...changedField, from: blank(changedField.from), to: blank(changedField.to) }
              : changedField,
          ),
        })),
      })),
    };
  }

  /**
   * Maps every provider-assigned identifier in the report to the terraform address and field that owns it.
   *
   * An identifier is owned by the address whose `id` it is, and otherwise by the first address and
   * field that mention it. Ordering is by address and field rather than by encounter, so adding a
   * test cannot rename an alias.
   */
  private static buildAliases(report: ValidateReport): Map<string, string> {
    // Collect every occurrence, keyed by the identifier and carrying where in the value it sat.
    const occurrences = new Map<string, { address: string; field: string; position: number }[]>();
    for (const intentChange of report.intentChanges) {
      for (const terraformChange of intentChange.terraformChanges) {
        for (const changedField of terraformChange.changedFields) {
          for (const value of [changedField.from, changedField.to]) {
            for (const candidate of ResourceAliasUtility.findCandidates(value ?? '')) {
              const entries = occurrences.get(candidate) ?? [];
              entries.push({
                address: terraformChange.address,
                field: changedField.field,
                position: (value ?? '').indexOf(candidate),
              });
              occurrences.set(candidate, entries);
            }
          }
        }
      }
    }

    // Name each identifier after its owner, preferring the address it identifies over one referencing it.
    const owners = new Map<string, { address: string; field: string; position: number }>();
    for (const [candidate, entries] of occurrences) {
      entries.sort(
        (a, b) => a.address.localeCompare(b.address) || a.field.localeCompare(b.field) || a.position - b.position,
      );
      owners.set(candidate, entries.find((entry) => entry.field === 'id') ?? entries[0]);
    }

    // Index the identifiers that share an owner, so two values listed in one field stay distinct.
    const aliases = new Map<string, string>();
    const grouped = new Map<string, string[]>();
    for (const [candidate, owner] of owners) {
      const base = owner.field === 'id' ? owner.address : `${owner.address}.${owner.field}`;
      grouped.set(base, [...(grouped.get(base) ?? []), candidate]);
    }
    for (const [base, candidates] of grouped) {
      candidates.sort((a, b) => owners.get(a)!.position - owners.get(b)!.position || a.localeCompare(b));
      candidates.forEach((candidate, index) => {
        aliases.set(candidate, candidates.length === 1 ? `<${base}>` : `<${base}[${index}]>`);
      });
    }

    return aliases;
  }

  /**
   * Returns the provider-assigned identifiers in one value, ignoring the fixtures that are already stable.
   */
  private static findCandidates(value: string): string[] {
    return RedactionUtility.findMatches(value, RedactionUtility.identifierRules());
  }

  /**
   * Rebuilds a value with `transform` applied to every string inside it.
   *
   * Keys holding `undefined` are kept, because a report distinguishes an absent reason from a missing one.
   */
  private static mapStrings<T>(value: T, transform: (text: string) => string): T {
    if (typeof value === 'string') {
      return transform(value) as T;
    }
    if (Array.isArray(value)) {
      return value.map((entry) => ResourceAliasUtility.mapStrings(entry, transform)) as T;
    }
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, ResourceAliasUtility.mapStrings(entry, transform)]),
      ) as T;
    }
    return value;
  }
}
