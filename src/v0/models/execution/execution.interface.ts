import { IInstance } from '../instance/instance.interface';
import { Execution } from './execution.model';

export interface IExecution {
  environmentVariables: Execution['environmentVariables'];
  executionId: Execution['executionId'];
  instances: IInstance[];
}
