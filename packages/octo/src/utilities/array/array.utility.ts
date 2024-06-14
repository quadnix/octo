export class ArrayUtility {
  static intersect<T>(compareFn: (a: T, b: T) => boolean, ...args: T[][]): T[] {
    for (const arg of args) {
      if (!Array.isArray(arg)) {
        throw new Error('Cannot intersect non-array elements!');
      }
    }

    if (args.length === 0) {
      return [];
    }
    if (args.length === 1) {
      return args[0];
    }
    if (args.length === 2) {
      return args[0].filter((a) => args[1].find((b) => compareFn(a, b)));
    }

    let intersected = args[0];
    for (let i = 1; i < args.length; i++) {
      intersected = ArrayUtility.intersect(compareFn, intersected, args[i]);
    }
    return intersected;
  }
}
