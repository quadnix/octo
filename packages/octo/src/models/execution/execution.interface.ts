import { IModelReference } from '../model.interface.js';

export interface IExecution {
  deployment: IModelReference;
  environment: IModelReference;
  environmentVariables: { [key: string]: string };
  image: IModelReference;
}
