import type { ReactElement } from 'react';
import type { TSDDeclarationReflection, TSDSignatureReflection } from '../types.js';
import { TypeAndParent } from './TypeAndParent.js';

export function hasSources(reflection: TSDDeclarationReflection | TSDSignatureReflection): boolean {
  return Boolean(reflection.implementationOf || reflection.inheritedFrom || reflection.overwrites);
}

export interface MemberSourcesProps {
  reflection: TSDDeclarationReflection | TSDSignatureReflection;
}

export function MemberSources({ reflection }: MemberSourcesProps): ReactElement | null {
  if (!hasSources(reflection)) {
    return null;
  }

  return (
    <aside className="tsd-sources">
      {reflection.implementationOf && (
        <p>
          Implementation of <TypeAndParent type={reflection.implementationOf} />
        </p>
      )}

      {reflection.inheritedFrom && (
        <p>
          Inherited from <TypeAndParent type={reflection.inheritedFrom} />
        </p>
      )}

      {reflection.overwrites && (
        <p>
          Overrides <TypeAndParent type={reflection.overwrites} />
        </p>
      )}
    </aside>
  );
}
