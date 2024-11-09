export interface IModule<I extends { [key: string]: unknown }, T> {
  collectInputs(): string[];

  onInit(inputs: Partial<I>): Promise<T>;
}
