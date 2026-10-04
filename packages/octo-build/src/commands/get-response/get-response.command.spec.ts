import { jest } from '@jest/globals';
import { StateManagementService, TestContainer } from '@quadnix/octo';
import type { ArgumentsCamelCase } from 'yargs';

type GetResponseArguments = { resourceId: string };

const mockedBootStateProvider = jest.fn<() => Promise<void>>().mockResolvedValue();
const mockedReportError = jest.fn<(error: unknown) => void>();

// Real ESM (`--experimental-vm-modules`) doesn't support `jest.mock()`'s hoisted auto-mocking of
// named function exports the way Jest's CJS mode does — `jest.unstable_mockModule` + a dynamic
// `import()` of the module under test (below) is the mechanism that actually works here.
jest.unstable_mockModule('../../utilities/octo/octo.utility.js', () => ({
  OctoUtility: {
    bootStateProvider: mockedBootStateProvider,
    reportError: mockedReportError,
  },
}));

const { getResponseCommand } = await import('./get-response.command.js');

describe('getResponseCommand UT', () => {
  const argv = { _: [], $0: 'octo', resourceId: 'igw-1' } as unknown as ArgumentsCamelCase<GetResponseArguments>;

  let stateManagementServiceMock: {
    getResourceResponse: jest.Mock<(resourceId: string) => Promise<Record<string, string> | undefined>>;
  };
  let processExitSpy: jest.SpiedFunction<typeof process.exit>;
  let stdoutWriteSpy: jest.SpiedFunction<typeof process.stdout.write>;
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;
  let consoleLogSpy: jest.SpiedFunction<typeof console.log>;

  beforeEach(async () => {
    stateManagementServiceMock = {
      getResourceResponse: jest
        .fn<(resourceId: string) => Promise<Record<string, string> | undefined>>()
        .mockResolvedValue({ igwId: 'igw-0real' }),
    };
    await TestContainer.create({
      mocks: [{ type: StateManagementService, value: stateManagementServiceMock as unknown as StateManagementService }],
    });

    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    stdoutWriteSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    mockedReportError.mockReset();
  });

  afterAll(async () => {
    await TestContainer.reset();
  });

  // Terraform's `data "external"` reads this command's stdout as the program's entire result, so
  // anything else written there — a log line, a banner, a stray newline — breaks the plan.
  describe('the stdout contract', () => {
    it('should write nothing to stdout when the resource has no recorded response', async () => {
      stateManagementServiceMock.getResourceResponse.mockResolvedValue(undefined);

      await getResponseCommand.handler(argv);

      expect(stdoutWriteSpy).not.toHaveBeenCalled();
      expect(mockedReportError).toHaveBeenCalledWith(
        expect.objectContaining({
          message:
            'No response recorded for resource "igw-1"! ' +
            'Octo records one when the resource is applied, and commits it with the rest of the run.',
        }),
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should write nothing to stdout when the state provider fails', async () => {
      mockedBootStateProvider.mockRejectedValueOnce(new Error('no definition file'));

      await getResponseCommand.handler(argv);

      expect(stdoutWriteSpy).not.toHaveBeenCalled();
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled(); // reportError owns the reporting
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should write exactly the response JSON and nothing else', async () => {
      await getResponseCommand.handler(argv);

      expect(stdoutWriteSpy).toHaveBeenCalledTimes(1);
      expect(stdoutWriteSpy).toHaveBeenCalledWith('{"igwId":"igw-0real"}');
      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(processExitSpy).not.toHaveBeenCalled();
    });
  });

  it('should read the response of the requested resource', async () => {
    await getResponseCommand.handler(argv);

    expect(stateManagementServiceMock.getResourceResponse).toHaveBeenCalledWith('igw-1');
  });
});
