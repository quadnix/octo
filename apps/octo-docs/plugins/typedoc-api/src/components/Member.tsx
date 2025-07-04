// https://github.com/TypeStrong/typedoc-default-themes/blob/master/src/default/partials/members.hbs

import React, { Fragment, type ReactElement, useContext } from 'react';
import type { JSONOutput } from 'typedoc';
import { useRequiredReflection } from '../hooks/useReflection.js';
import { useReflectionMap } from '../hooks/useReflectionMap.js';
import { escapeMdx } from '../utils/helpers.js';
import { hasOwnDocument } from '../utils/visibility.js';
import { AnchorLink } from './AnchorLink.js';
import { ApiOptionsContext } from './ApiOptionsContext.js';
import { CommentBadges, isCommentWithModifiers } from './CommentBadges.js';
import { Flags } from './Flags.js';
import { MemberDeclaration } from './MemberDeclaration.js';
import { MemberGetterSetter } from './MemberGetterSetter.js';
import { MemberReference } from './MemberReference.js';
import { MemberSignatures } from './MemberSignatures.js';
import { SourceLink } from './SourceLink.js';

export interface MemberProps {
  id: number;
}

export function Member({ id }: MemberProps): ReactElement | false {
  const reflections = useReflectionMap();
  const reflection = useRequiredReflection(id);
  const { comment } = reflection;
  let content: React.ReactNode = null;

  const apiOptions = useContext(ApiOptionsContext);
  const shouldHideInherited = reflection.inheritedFrom ? apiOptions.hideInherited : false;

  if (reflection.signatures) {
    content = <MemberSignatures inPanel sigs={reflection.signatures} />;
  } else if (reflection.getSignature || reflection.setSignature) {
    content = <MemberGetterSetter inPanel getter={reflection.getSignature} setter={reflection.setSignature} />;
  } else if ('target' in reflection && (reflection as JSONOutput.ReferenceReflection).target) {
    content = <MemberReference reflection={reflection as JSONOutput.ReferenceReflection} />;
  } else {
    content = <MemberDeclaration id={id} />;
  }

  return (
    !shouldHideInherited && (
      <section className="tsd-panel tsd-member">
        <h3 className="tsd-panel-header">
          <AnchorLink id={reflection.name} />
          <SourceLink sources={reflection.sources} />
          <Flags flags={reflection.flags} />
          {escapeMdx(reflection.name)}
          {isCommentWithModifiers(comment) && <CommentBadges comment={comment} />}
        </h3>

        {content}

        {reflection.groups?.map((group) => (
          <Fragment key={group.title}>
            {group.children?.map((child) =>
              hasOwnDocument(child, reflections) ? null : <Member key={child} id={child} />,
            )}
          </Fragment>
        ))}
      </section>
    )
  );
}
