import { resolve } from 'path';
import { jest } from '@jest/globals';
import { StateManagementService, TestContainer } from '@quadnix/octo';
import type { ArgumentsCamelCase } from 'yargs';

type GenerateArguments = { outputDir: string };

const mockedReportError = jest.fn<(error: unknown) => void>();
const mockedGenerate = jest.fn<(app: unknown, options: { outputDir: string }) => Promise<void>>();
const mockedBootOcto = jest.fn<() => Promise<unknown>>();
const mockedBootStateProvider = jest.fn<() => Promise<void>>().mockResolvedValue();

// Real ESM (`--experimental-vm-modules`) doesn't support `jest.mock()`'s hoisted auto-mocking of
// named function exports the way Jest's CJS mode does — `jest.unstable_mockModule` + a dynamic
// `import()` of the module under test (below) is the mechanism that actually works here.
jest.unstable_mockModule('../../utilities/octo/octo.utility.js', () => ({
  OctoUtility: {
    bootOcto: mockedBootOcto,
    bootStateProvider: mockedBootStateProvider,
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

const { generateCommand } = await import('./generate.command.js');

describe('generateCommand UT', () => {
  const outputDir = '.octo-tf';
  const resolvedOutputDir = resolve(process.cwd(), outputDir);
  const argv = { _: [], $0: 'octo', outputDir } as unknown as ArgumentsCamelCase<GenerateArguments>;

  let processExitSpy: jest.SpiedFunction<typeof process.exit>;
  let consoleLogSpy: jest.SpiedFunction<typeof console.log>;
  let refreshStateMock: jest.Mock<() => Promise<void>>;

  beforeEach(async () => {
    refreshStateMock = jest.fn<() => Promise<void>>().mockResolvedValue();
    await TestContainer.create({
      mocks: [
        {
          type: StateManagementService,
          value: { refreshState: refreshStateMock } as unknown as StateManagementService,
        },
      ],
    });

    mockedGenerate.mockResolvedValue(undefined);
    mockedBootOcto.mockResolvedValue({ app: { name: 'test-app' }, octo: { generate: mockedGenerate } });

    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    mockedReportError.mockReset();
    mockedGenerate.mockReset();
    mockedBootOcto.mockReset();
  });

  afterAll(async () => {
    await TestContainer.reset();
  });

  it('should generate into the output directory resolved against the cwd', async () => {
    await generateCommand.handler(argv);

    expect(mockedGenerate).toHaveBeenCalledWith(expect.anything(), { outputDir: resolvedOutputDir });
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('should refresh the state before octo boots and reads it', async () => {
    mockedBootOcto.mockImplementation(async () => {
      expect(refreshStateMock).toHaveBeenCalled();
      return { app: { name: 'test-app' }, octo: { generate: mockedGenerate } };
    });

    await generateCommand.handler(argv);

    expect(mockedBootOcto).toHaveBeenCalled();
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('should boot octo on stdout, unlike run-action', async () => {
    await generateCommand.handler(argv);

    expect(mockedBootOcto).toHaveBeenCalledWith();
  });

  // The listener reports what was written, from `TerraformFoldersWrittenEvent` — it carries the
  // folder count and the emptied ones. The command owns only the verdict, so that a wording change
  // never needs an edit in both packages.
  it('should write nothing to stdout, leaving it entirely to the listeners', async () => {
    await generateCommand.handler(argv);

    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it('should report the error and exit non-zero when generation fails', async () => {
    mockedGenerate.mockRejectedValue(new Error('nothing to generate'));

    await generateCommand.handler(argv);

    expect(mockedReportError).toHaveBeenCalledWith(expect.objectContaining({ message: 'nothing to generate' }));
    expect(processExitSpy).toHaveBeenCalledWith(1);
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it('should report the error and exit non-zero when the boot fails', async () => {
    mockedBootOcto.mockRejectedValue(new Error('definition file is invalid'));

    await generateCommand.handler(argv);

    expect(mockedGenerate).not.toHaveBeenCalled();
    expect(mockedReportError).toHaveBeenCalledWith(expect.objectContaining({ message: 'definition file is invalid' }));
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });
});
