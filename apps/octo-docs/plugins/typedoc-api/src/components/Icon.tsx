import type { ReactElement } from 'react';
import type { TSDDeclarationReflection, TSDSignatureReflection } from '../types.js';
import { getKindIcon, getKindIconColor } from '../utils/icons.js';

export interface IconProps {
  reflection: TSDDeclarationReflection | TSDSignatureReflection;
}

export function Icon({ reflection }: IconProps): ReactElement | null {
  const icon = getKindIcon(reflection.kind, reflection.name);

  if (!icon) {
    return null;
  }

  const color = getKindIconColor(reflection.kind);

  return <i className={`codicon codicon-${icon}`} style={{ color }} />;
}
