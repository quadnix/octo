import { IInstance } from '../instance/instance.interface';
import { Execution } from './execution.model';

export interface IExecution {
  environmentVariables: { [key: string]: string };
  executionId: Execution['executionId'];
  instances: IInstance[];
}
