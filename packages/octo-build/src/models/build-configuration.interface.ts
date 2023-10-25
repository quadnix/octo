export interface IJob {
  command: string;
  dependsOn: string[];
  onError: 'ignore' | 'throw';
  retry: number;
  timeout: number;
}

export interface IBuildConfiguration {
  dist: string;
  env: { [key: string]: string };
  jobs: {
    [key: string]: IJob;
  };
}
