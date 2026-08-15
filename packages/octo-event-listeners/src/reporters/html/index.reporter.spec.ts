import { emptyTotals } from '../report.model.js';
import { type IndexRun, renderIndexHtml } from './index.reporter.js';

function run(overrides: Partial<IndexRun> = {}): IndexRun {
  return {
    basename: '20260815T024126-validate.html',
    mode: 'validate',
    timestamp: '20260815T024126',
    ...overrides,
  };
}

describe('renderIndexHtml()', () => {
  it('links to the page and its payload', () => {
    const html = renderIndexHtml([run()]);

    expect(html).toContain('href="./20260815T024126-validate.html"');
    expect(html).toContain('href="./20260815T024126-validate.json"');
  });

  it('reads the timestamp out of the filename as UTC', () => {
    expect(renderIndexHtml([run()])).toContain('2026-08-15 02:41:26 UTC');
  });

  /**
   * The index exists to answer "which of these 27 runs was the drifted one". A column of dates cannot, which is what made the pile-up of reports a real problem rather than a disk one.
   */
  it('shows the outcome, so a drifted run can be spotted without opening it', () => {
    const html = renderIndexHtml([
      run({ basename: '20260815T024126-validate.html', outcome: 'drift' }),
      run({ basename: '20260815T025202-validate.html', outcome: 'clean', timestamp: '20260815T025202' }),
    ]);

    expect(html).toContain('<span class="badge drift">drift</span>');
    expect(html).toContain('<span class="badge clean">clean</span>');
  });

  it('carries the headline and the counts of each run', () => {
    const html = renderIndexHtml([
      run({
        driftCount: 2,
        headline: 'You replaced backend-server-module.',
        totals: { ...emptyTotals(), create: 3, delete: 1 },
      }),
    ]);

    expect(html).toContain('You replaced backend-server-module.');
    expect(html).toContain('>-1<');
    expect(html).toContain('>+3<');
    expect(html).toContain('>⚠2<');
  });

  it('still lists a run whose payload could not be read', () => {
    const html = renderIndexHtml([run()]);

    expect(html).toContain('20260815T024126-validate.html');
    expect(html).not.toContain('class="badge');
  });

  it('says so when there are no reports', () => {
    expect(renderIndexHtml([])).toContain('No reports yet.');
  });
});
