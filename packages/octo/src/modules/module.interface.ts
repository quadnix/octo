export interface IModule<T> {
  onInit(): Promise<T>;
}
