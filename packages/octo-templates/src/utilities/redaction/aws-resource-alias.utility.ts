import type { TestModuleContainer } from '@quadnix/octo';

type ValidateReport = NonNullable<
  (TestModuleContainer['runModules'] extends (...args: never[]) => AsyncGenerator<infer TYield>
    ? TYield
    : never)['validateReport']
>;

/**
 * An AWS-assigned identifier: a lowercase type prefix and a hexadecimal suffix, e.g. `subnet-013a66645b3b4cd15`.
 */
const AWS_IDENTIFIER = /\b[a-z]+(?:-[a-z]+)*-[0-9a-f]{8,17}\b/g;

/**
 * A bare IPv4 address. A CIDR block carries a prefix length and is declared configuration, so it is left alone.
 */
const IPV4_ADDRESS = /(?<![\d.])\d{1,3}(?:\.\d{1,3}){3}(?![\d./])/g;

/**
 * Replaces AWS-assigned identifiers in a validate report with an alias naming the resource that owns them.
 *
 * A report captured from a live plan carries whatever identifiers AWS handed out on that run, so a
 * committed snapshot of one breaks the moment the infrastructure is recreated. An alias is derived
 * from the terraform address octo renders, which is the same on every run.
 *
 * Aliasing is all-or-nothing: an identifier this utility cannot name throws rather than reaching a
 * snapshot, so a resource kind it has never seen fails the test instead of leaking.
 */
export class AwsResourceAliasUtility {
  /**
   * The hexadecimal suffix of an identifier that is already a fixture, e.g. terragrunt's `vpc-0123456789abcdef0`.
   */
  static readonly PLACEHOLDER_SUFFIX = '0123456789abcdef0';

  /**
   * Returns a copy of `report` with every AWS-assigned identifier replaced by its alias.
   *
   * @throws If the report holds an identifier that no terraform address claims.
   */
  static alias(report: ValidateReport): ValidateReport {
    const aliases = AwsResourceAliasUtility.buildAliases(report);

    // Replace the longest identifiers first, so one that contains another cannot be half-substituted.
    const literals = [...aliases.keys()].sort((a, b) => b.length - a.length);
    const aliased = AwsResourceAliasUtility.mapStrings(report, (text) =>
      literals.reduce((substituted, literal) => substituted.split(literal).join(aliases.get(literal)!), text),
    );

    // Refuse to hand back a report that still names live infrastructure.
    const leaked = new Set<string>();
    AwsResourceAliasUtility.mapStrings(aliased, (text) => {
      AwsResourceAliasUtility.findCandidates(text).forEach((candidate) => leaked.add(candidate));
      return text;
    });
    if (leaked.size > 0) {
      throw new Error(
        `Validate report holds an AWS identifier that no terraform address claims: ${[...leaked].sort().join(', ')}!`,
      );
    }

    return aliased;
  }

  /**
   * Maps every AWS-assigned identifier in the report to the terraform address and field that owns it.
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
            for (const candidate of AwsResourceAliasUtility.findCandidates(value ?? '')) {
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
   * Returns the AWS-assigned identifiers in one value, ignoring the fixtures that are already stable.
   */
  private static findCandidates(value: string): string[] {
    return [...value.matchAll(AWS_IDENTIFIER), ...value.matchAll(IPV4_ADDRESS)]
      .map((match) => match[0])
      .filter((candidate) => !candidate.includes(AwsResourceAliasUtility.PLACEHOLDER_SUFFIX));
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
      return value.map((entry) => AwsResourceAliasUtility.mapStrings(entry, transform)) as T;
    }
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, AwsResourceAliasUtility.mapStrings(entry, transform)]),
      ) as T;
    }
    return value;
  }
}
