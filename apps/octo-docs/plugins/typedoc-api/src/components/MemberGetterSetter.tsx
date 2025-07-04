// https://github.com/TypeStrong/typedoc-default-themes/blob/master/src/default/partials/member.getterSetter.hbs

import type { ReactElement } from 'react';
import { useMinimalLayout } from '../hooks/useMinimalLayout.js';
import type { TSDDeclarationReflection } from '../types.js';
import { escapeMdx } from '../utils/helpers.js';
import { Icon } from './Icon.js';
import { MemberSignatureBody, hasSigBody } from './MemberSignatureBody.js';
import { MemberSignatureTitle } from './MemberSignatureTitle.js';

export interface MemberGetterSetterProps {
  inPanel?: boolean;
  getter?: TSDDeclarationReflection['getSignature'];
  setter?: TSDDeclarationReflection['setSignature'];
}

// eslint-disable-next-line complexity
export function MemberGetterSetter({ inPanel, getter, setter }: MemberGetterSetterProps): ReactElement | null {
  const minimal = useMinimalLayout();

  if (!getter && !setter) {
    return null;
  }

  return (
    <>
      {(getter || setter) && (
        <div className={inPanel ? 'tsd-panel-content' : ''}>
          <ul className="tsd-signatures">
            {getter && (
              <li className="tsd-signature tsd-kind-icon">
                <Icon reflection={getter} />
                <span className="tsd-signature-symbol">get </span>
                {escapeMdx(getter.name)}
                <MemberSignatureTitle hideName sig={getter} />
              </li>
            )}

            {setter && (
              <li className="tsd-signature tsd-kind-icon">
                <Icon reflection={setter} />
                <span className="tsd-signature-symbol">set </span>
                {escapeMdx(setter.name)}
                <MemberSignatureTitle hideName sig={setter} />
              </li>
            )}
          </ul>
        </div>
      )}

      {(hasSigBody(getter, minimal) || hasSigBody(setter, minimal)) && (
        <div className={inPanel ? 'tsd-panel-content' : ''}>
          <ul className="tsd-descriptions">
            {getter && (
              <li className="tsd-description">
                <MemberSignatureBody sig={getter} />
              </li>
            )}

            {setter && (
              <li className="tsd-description">
                <MemberSignatureBody sig={setter} />
              </li>
            )}
          </ul>
        </div>
      )}
    </>
  );
}
