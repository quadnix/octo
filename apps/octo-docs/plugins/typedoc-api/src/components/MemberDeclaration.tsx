// https://github.com/TypeStrong/typedoc-default-themes/blob/master/src/default/partials/member.declaration.hbs

import type { ReactElement } from 'react';
import { useMinimalLayout } from '../hooks/useMinimalLayout.js';
import { useRequiredReflection } from '../hooks/useReflection.js';
import { escapeMdx } from '../utils/helpers.js';
import { Comment, hasComment } from './Comment.js';
import { DefaultValue } from './DefaultValue.js';
import { Icon } from './Icon.js';
import { MemberSources } from './MemberSources.js';
import { Parameter } from './Parameter.js';
import { Type, extractDeclarationFromType } from './Type.js';
import { TypeParameters } from './TypeParameters.js';
import { TypeParametersGeneric } from './TypeParametersGeneric.js';

export interface MemberDeclarationProps {
  id: number;
}

export function MemberDeclaration({ id }: MemberDeclarationProps): ReactElement {
  const reflection = useRequiredReflection(id);
  const minimal = useMinimalLayout();
  const showTypes = reflection.typeParameters && reflection.typeParameters.length > 0;
  const showDeclaration = !minimal && extractDeclarationFromType(reflection.type);

  if (reflection.variant.toLowerCase() === 'document') {
    return (
      <div className="tsd-panel-content">
        <Comment comment={{ summary: (reflection as any).content }} />
      </div>
    );
  }

  return (
    <>
      <div className="tsd-panel-content">
        <div className="tsd-signature tsd-kind-icon">
          <Icon reflection={reflection} />
          {escapeMdx(reflection.name)}
          <TypeParametersGeneric params={reflection.typeParameters} />
          <span className="tsd-signature-symbol">{reflection.flags?.isOptional && '?'}: </span>{' '}
          <Type type={reflection.type} />
          <DefaultValue comment={reflection.comment} type={reflection.type} value={reflection.defaultValue} />
        </div>
      </div>

      <div className="tsd-panel-content">
        <MemberSources reflection={reflection} />

        <Comment comment={reflection.comment} />

        {hasComment(reflection.comment) && (showTypes || showDeclaration) && <hr className="tsd-divider" />}

        {showTypes && (
          <div className="tds-type-parameters">
            <h4 className="tsd-type-parameters-title">Type parameters</h4>
            <TypeParameters params={reflection.typeParameters} />
          </div>
        )}

        {showDeclaration && (
          <div className="tsd-type-declaration">
            <h4>Type declaration</h4>
            <Parameter param={extractDeclarationFromType(reflection.type)} />
          </div>
        )}
      </div>
    </>
  );
}
