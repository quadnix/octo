import { IModelReference } from '../model.interface';

export interface IExecution {
  deployment: IModelReference;
  environment: IModelReference;
  environmentVariables: { [key: string]: string };
}
