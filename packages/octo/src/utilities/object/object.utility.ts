export class ObjectUtility {
  // Source: https://stackoverflow.com/a/58496119/1834562
  static deepFreeze<T extends object>(object: T): void {
    Object.freeze(object);
    Object.values(object)
      .filter((x) => !Object.isFrozen(x))
      .forEach(ObjectUtility.deepFreeze);
  }
}
