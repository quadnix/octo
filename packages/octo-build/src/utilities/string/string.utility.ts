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

  static isKebabCase(subject: string): boolean {
    return /^[a-z][a-z0-9-]*[a-z0-9]$/.test(subject);
  }

  static toCamelCase(subject: string): string {
    const pascal = StringUtility.toPascalCase(subject);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
  }

  static toPascalCase(subject: string): string {
    return subject
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
  }
}
