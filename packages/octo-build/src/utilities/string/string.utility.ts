/**
 * Name checks and case conversions the `create-*` scaffolding commands run on user input.
 */
export class StringUtility {
  static AVAILABLE_MODEL_TYPES = [
    'account',
    'app',
    'deployment',
    'environment',
    'execution',
    'filesystem',
    'image',
    'pipeline',
    'region',
    'server',
    'service',
    'subnet',
  ] as const;

  /**
   * Whether a name is kebab-case, the shape every generated file and folder uses.
   */
  static isKebabCase(subject: string): boolean {
    return /^[a-z][a-z0-9-]*[a-z0-9]$/.test(subject);
  }

  /**
   * Mirrors the check the `@Resource`/`@Model`/`@Module`/`@Overlay`/`@Anchor` decorators run in
   * `packages/octo`. Kept identical to theirs on purpose: a name this accepts and they reject would
   * generate happily and fail much later, at registration, with `Invalid package name`.
   *
   * Note it admits a leading `@` but no `/` - `@octo` is the shape in use, `@my/pkg` is not a
   * package name here.
   */
  static isValidPackageName(subject: string): boolean {
    return /^[@A-Za-z][\w-]+[A-Za-z]$/.test(subject);
  }

  /**
   * `my-thing` to `myThing`, for generated variable names.
   */
  static toCamelCase(subject: string): string {
    const pascal = StringUtility.toPascalCase(subject);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
  }

  /**
   * `my-thing` to `MyThing`, for generated class names.
   */
  static toPascalCase(subject: string): string {
    return subject
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
  }
}
