/**
 * What terraform does to one address, as the report names it.
 */
export type ValidateReportAction = 'create' | 'delete' | 'other' | 'replace' | 'update';

/**
 * One terraform address under a change octo explained, and the arguments the plan moves on it.
 */
export type ValidateReportChange = { action: ValidateReportAction; address: string; fields: string[] };

/**
 * One terraform address no intent change explains, and the module whose folder holds it.
 */
export type ValidateReportUnexplained = { action: ValidateReportAction; address: string; moduleId: string };

/**
 * The parts of a printed validate report a test asserts on.
 */
export type ValidateReport = {
  changes: ValidateReportChange[];
  confidence: 'approximate' | 'exact' | undefined;
  dataLoss: string[];
  drift: ValidateReportUnexplained[];
  failures: string[];
  notes: string[];
  uncertain: ValidateReportUnexplained[];
};

const ACTIONS: { [symbol: string]: ValidateReportAction } = {
  '-': 'delete',
  '?': 'other',
  '+': 'create',
  '±': 'replace',
  '~': 'update',
};

const HEADINGS = {
  changes: 'WHAT WILL CHANGE',
  dataLoss: 'DATA LOSS — ',
  drift: 'DRIFT — ',
  failures: 'FAILURES — ',
  notes: 'NOTES',
  uncertain: 'UNCERTAIN — ',
};

/**
 * Reads the report `octo validate` prints, the one a user reviews before an apply.
 *
 * @group Utilities/Report
 */
export class ValidateReportUtility {
  /**
   * Parses the last validate report in `output`, which is everything a command wrote to stderr.
   *
   * @throws If `output` holds no validate report.
   */
  static parse(output: string): ValidateReport {
    const lines = output.split('\n');
    const start = lines.reduce((found, line, index) => (line.includes(' — octo validate — ') ? index : found), -1);
    if (start === -1) {
      throw new Error('Output holds no validate report!');
    }

    // Sections run from their heading to the next blank line.
    const header = lines[start];
    const sections: { [heading: string]: string[] } = {};
    let current: string[] | undefined;
    for (const line of lines.slice(start + 1)) {
      if (line.trim() === '') {
        current = undefined;
      } else if (current) {
        current.push(line);
      } else if (/^[A-Z]/.test(line)) {
        current = sections[line] = [];
      }
    }
    const section = (prefix: string): string[] =>
      Object.entries(sections).find(([heading]) => heading.startsWith(prefix))?.[1] ?? [];

    return {
      changes: this.parseChanges(section(HEADINGS.changes)),
      confidence: header.endsWith('(exact)') ? 'exact' : header.endsWith('(approximate)') ? 'approximate' : undefined,
      dataLoss: section(HEADINGS.dataLoss).map((line) => line.trim()),
      drift: this.parseUnexplained(section(HEADINGS.drift)),
      failures: section(HEADINGS.failures).map((line) => line.trim()),
      notes: section(HEADINGS.notes).map((line) => line.trim()),
      uncertain: this.parseUnexplained(section(HEADINGS.uncertain)),
    };
  }

  /**
   * The terraform addresses under every story, at eight spaces, each with the fields below it.
   */
  private static parseChanges(lines: string[]): ValidateReportChange[] {
    const changes: ValidateReportChange[] = [];
    for (const line of lines) {
      const address = /^ {10}(\S) (\S+)$/.exec(line);
      const field = /^ {14}(\S+): .* → .*$/.exec(line);
      if (address && ACTIONS[address[1]]) {
        changes.push({ action: ACTIONS[address[1]], address: address[2], fields: [] });
      } else if (field && changes.length > 0) {
        changes[changes.length - 1].fields.push(field[1]);
      }
    }
    return changes;
  }

  /**
   * The rows of a drift or uncertain section: `  <symbol> <address>  [<moduleId>]`.
   */
  private static parseUnexplained(lines: string[]): ValidateReportUnexplained[] {
    return lines.flatMap((line) => {
      const row = /^ {2}(\S) (\S+) {2}\[(.+)\]$/.exec(line);
      return row && ACTIONS[row[1]] ? [{ action: ACTIONS[row[1]], address: row[2], moduleId: row[3] }] : [];
    });
  }
}
