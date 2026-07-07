/* eslint no-fallthrough: 0 */

import type { ReflectionKind } from 'typedoc';

// We have to map these manually instead of using the `ReflectionKind` enum,
// otherwise the `typedoc` package ends up in the bundle and crashes.
 
const KIND_ICONS: Record<ReflectionKind, string> = {
  1: 'project', // Project
  1024: 'symbol-property', // Property
  1_048_576: 'symbol-field', // SetSignature
  128: 'symbol-class', // Class
  131_072: 'symbol-type-parameter', // TypeParameter
  16: 'symbol-enum-member', // EnumMember
  16_384: 'symbol-method', // ConstructorSignature
  2: 'package', // Module
  2048: 'symbol-method', // Method
  2_097_152: 'symbol-parameter', // TypeAlias
  256: 'symbol-interface', // Interface
  262_144: 'symbol-field', // Accessor
  32: 'symbol-variable', // Variable
  32_768: 'symbol-property', // Parameter
  4: 'symbol-namespace', // Namespace
  4096: 'symbol-method', // CallSignature
  4_194_304: 'references', // Reference
  512: 'symbol-constructor', // Constructor
  524_288: 'symbol-field', // GetSignature
  64: 'symbol-function', // Function
  65_536: 'symbol-key', // TypeLiteral
  8: 'symbol-enum', // Enum
  8192: 'bracket-dot', // IndexSignature
  8_388_608: 'references', // Document
};
 

export function getKindIcon(kind: ReflectionKind, name: string): string {
  let icon = KIND_ICONS[kind];

  // Use event icon when property starts with "on"
  if (kind === 1024 && name.match(/^on[A-Z]/)) {
    icon = 'symbol-event';
  }

  return icon;
}

export function getKindIconColor(kind: ReflectionKind): string {
  switch (kind) {
    // Function
    case 64:
    // Constructor
    case 512:
    // Method
    case 2048:
    // CallSignature
    case 4096:
    // ConstructorSignature
    case 16_384:
    // Accessor
    case 262_144:
      return 'var(--ifm-color-info)';

    // EnumMember
    case 16:
    // Variable
    case 32:
    // Property
    case 1024:
    // GetSignature
    case 524_288:
    // SetSignature
    case 1_048_576:
      return 'var(--ifm-color-success)';

    // Namespace
    case 4:
    // Class
    case 128:
      return 'var(--ifm-color-warning)';

    // Enum
    case 8:
    // Interface
    case 256:
    // TypeAlias
    case 4_194_304:
      return 'var(--ifm-color-danger)';

    default:
      return 'inherit';
  }
}

export function getKindIconHtml(kind: ReflectionKind, name: string): string {
  const icon = getKindIcon(kind, name);

  if (!icon) {
    return '';
  }

  const color = getKindIconColor(kind);

  return `<i class="codicon codicon-${icon}" style="color:${color};"></i>`;
}
