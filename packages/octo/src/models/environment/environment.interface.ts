import { Environment } from './environment.model';

export interface IEnvironment {
  environmentName: Environment['environmentName'];
  environmentVariables: { [key: string]: string };
}
