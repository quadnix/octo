export interface IRunArguments {
  buildFilePath: string;
  concurrency: number;
  dryRun: boolean;
  logsDir?: string | undefined;
  sourcePath: string;
  timeout: number;
}
