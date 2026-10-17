import { jest } from '@jest/globals';
import type { ArgumentsCamelCase } from 'yargs';

type RunActionArguments = { input?: string[]; resourceId: string };
type RunActionResult = { action: string; resourceId: string; response: Record<string, string> };

const mockedReportError = jest.fn<(error: unknown) => void>();
const mockedRunAction = jest.fn<(app: unknown, options: unknown) => Promise<RunActionResult>>();
const mockedBootOcto = jest.fn<() => Promise<unknown>>();

// Real ESM (`--experimental-vm-modules`) doesn't support `jest.mock()`'s hoisted auto-mocking of
// named function exports the way Jest's CJS mode does — `jest.unstable_mockModule` + a dynamic
// `import()` of the module under test (below) is the mechanism that actually works here.
jest.unstable_mockModule('../../utilities/octo/octo.utility.js', () => ({
  OctoUtility: {
    bootOcto: mockedBootOcto,
    reportError: mockedReportError,
    runCommand: async (_command: string, body: () => Promise<number | void>): Promise<void> => {
      try {
        const exitCode = await body();
        if (exitCode) {
          process.exit(exitCode);
        }
      } catch (error) {
        mockedReportError(error);
        process.exit(1);
      }
    },
  },
}));

const { runActionCommand } = await import('./run-action.command.js');

describe('runActionCommand UT', () => {
  const argv = (overrides: Partial<RunActionArguments> = {}): ArgumentsCamelCase<RunActionArguments> =>
    ({ _: [], $0: 'octo', resourceId: 'igw-1', ...overrides }) as unknown as ArgumentsCamelCase<RunActionArguments>;

  let processExitSpy: jest.SpiedFunction<typeof process.exit>;
  let stdoutWriteSpy: jest.SpiedFunction<typeof process.stdout.write>;
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;
  let consoleLogSpy: jest.SpiedFunction<typeof console.log>;

  beforeEach(() => {
    mockedRunAction.mockResolvedValue({ action: 'add', resourceId: 'igw-1', response: { igwId: 'igw-0real' } });
    mockedBootOcto.mockResolvedValue({ app: { name: 'test-app' }, octo: { runAction: mockedRunAction } });

    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    stdoutWriteSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    mockedReportError.mockReset();
    mockedRunAction.mockReset();
    mockedBootOcto.mockReset();
  });

  // Terraform's `data "external"` reads this command's stdout as the program's entire result, so
  // anything else written there — a log line, a banner, a stray newline — breaks the apply.
  describe('the stdout contract', () => {
    it('should write exactly the response JSON and nothing else', async () => {
      await runActionCommand.handler(argv());

      expect(stdoutWriteSpy).toHaveBeenCalledTimes(1);
      expect(stdoutWriteSpy).toHaveBeenCalledWith('{"igwId":"igw-0real"}');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should write nothing to stdout when the action fails', async () => {
      mockedRunAction.mockRejectedValue(new Error('action blew up'));

      await runActionCommand.handler(argv());

      expect(stdoutWriteSpy).not.toHaveBeenCalled();
      expect(mockedReportError).toHaveBeenCalledWith(expect.objectContaining({ message: 'action blew up' }));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should write nothing to stdout when an input is malformed', async () => {
      await runActionCommand.handler(argv({ input: ['no-separator-here'] }));

      expect(stdoutWriteSpy).not.toHaveBeenCalled();
      expect(mockedRunAction).not.toHaveBeenCalled();
      expect(mockedReportError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Invalid --input "no-separator-here"! Expected <parentResourceId>.<responseKey>=<value>.',
        }),
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('--input parsing', () => {
    it('should key each input by everything before the first "="', async () => {
      await runActionCommand.handler(argv({ input: ['vpc-1.VpcId=vpc-0real', 'vpc-1.Cidr=10.0.0.0/16'] }));

      expect(mockedRunAction).toHaveBeenCalledWith(expect.anything(), {
        inputs: { 'vpc-1.Cidr': '10.0.0.0/16', 'vpc-1.VpcId': 'vpc-0real' },
        resourceId: 'igw-1',
      });
    });

    it('should keep "=" inside a value', async () => {
      // An external parent's whole response arrives as one JSON object, and base64 padding and
      // query strings both carry "=" — splitting on the last one, or on every one, corrupts them.
      await runActionCommand.handler(argv({ input: ['vpc-1={"Token":"YWJjZA=="}'] }));

      expect(mockedRunAction).toHaveBeenCalledWith(expect.anything(), {
        inputs: { 'vpc-1': '{"Token":"YWJjZA=="}' },
        resourceId: 'igw-1',
      });
    });

    it('should pass no inputs when the flag is absent', async () => {
      await runActionCommand.handler(argv());

      expect(mockedRunAction).toHaveBeenCalledWith(expect.anything(), { inputs: {}, resourceId: 'igw-1' });
    });
  });

  it('should not print diagnostics to stdout on failure', async () => {
    mockedBootOcto.mockRejectedValue(new Error('boot failed'));

    await runActionCommand.handler(argv());

    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(stdoutWriteSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled(); // reportError owns the reporting
  });
});
