export interface IBuildConfiguration {
  dist: string;
  env: { [key: string]: string };
  jobs: {
    [key: string]: IJob;
  };
}

export interface IJob {
  command: string;
  dependsOn: string[];
  onError: 'ignore' | 'throw';
  retry: number;
  timeout: number;
}
