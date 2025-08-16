// https://github.com/TypeStrong/typedoc-default-themes/blob/master/src/default/templates/reflection.hbs

import { type ReactElement, useMemo } from 'react';
import type { TSDDeclarationReflection, TSDReflection, TSDSignatureReflection } from '../types.js';
import { createHierarchy } from '../utils/hierarchy.js';
import { Comment, hasComment } from './Comment.js';
import { CommentBadges, isCommentWithModifiers } from './CommentBadges.js';
import { Hierarchy } from './Hierarchy.js';
import { Icon } from './Icon.js';
import { Index } from './Index.js';
import { MemberSignatures } from './MemberSignatures.js';
import { Members } from './Members.js';
import { Parameter } from './Parameter.js';
import { Type, extractDeclarationFromType } from './Type.js';
import { TypeParameters } from './TypeParameters.js';

export interface ReflectionProps {
  reflection: TSDDeclarationReflection | TSDReflection | TSDSignatureReflection;
}

export function Reflection({ reflection }: ReflectionProps): ReactElement {
  const hierarchy = useMemo(() => createHierarchy(reflection), [reflection]);

  return (
    <>
      {isCommentWithModifiers(reflection.comment) && <CommentBadges comment={reflection.comment} />}
      {hasComment(reflection.comment) && <Comment root comment={reflection.comment} />}

      {'typeParameters' in reflection &&
        reflection.typeParameters &&
        reflection.typeParameters.length > 0 &&
        // Class
        reflection.kind !== 128 && (
          <section className="tsd-panel">
            <h3 className="tsd-panel-header">Type parameters</h3>

            <div className="tsd-panel-content">
              <TypeParameters params={reflection.typeParameters} />
            </div>
          </section>
        )}

      {(('extendedBy' in reflection && reflection.extendedBy && reflection.extendedBy.length > 0) ||
        ('extendedTypes' in reflection && reflection.extendedTypes && reflection.extendedTypes.length > 0)) && (
        <section className="tsd-panel">
          <h3 className="tsd-panel-header">Hierarchy</h3>

          <div className="tsd-panel-content">
            <Hierarchy tree={hierarchy} />
          </div>
        </section>
      )}

      {'implementedTypes' in reflection && reflection.implementedTypes && reflection.implementedTypes.length > 0 && (
        <section className="tsd-panel">
          <h3 className="tsd-panel-header">Implements</h3>

          <div className="tsd-panel-content">
            <ul className="tsd-hierarchy">
              {reflection.implementedTypes.map((type, i) => (
                <li key={type.type + String(i)}>
                  <Type type={type} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {'implementedBy' in reflection && reflection.implementedBy && reflection.implementedBy.length > 0 && (
        <section className="tsd-panel">
          <h3 className="tsd-panel-header">Implemented by</h3>

          <div className="tsd-panel-content">
            <ul className="tsd-hierarchy">
              {reflection.implementedBy.map((type, i) => (
                <li key={type.name + String(i)}>
                  <Type type={type} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {'signatures' in reflection && reflection.signatures && reflection.signatures.length > 0 && (
        <section className="tsd-panel">
          <h3 className="tsd-panel-header tsd-before-signature">Callable</h3>

          <div className="tsd-panel-content">
            <MemberSignatures sigs={reflection.signatures} />
          </div>
        </section>
      )}

      {'indexSignatures' in reflection && reflection.indexSignatures && (
        <section className="tsd-panel">
          <h3 className="tsd-panel-header tsd-before-signature">Indexable</h3>

          <div className="tsd-panel-content">
            <div className="tsd-signature tsd-kind-icon">
              <Icon reflection={reflection.indexSignatures[0]} />
              <span className="tsd-signature-symbol">[</span>
              {reflection.indexSignatures[0].parameters?.map((param) => (
                <span key={param.id}>
                  {param.name}
                  {': '}
                  <Type type={param.type} />
                </span>
              ))}
              <span className="tsd-signature-symbol">]: </span>
              <Type type={reflection.indexSignatures[0].type} />
            </div>

            <Comment comment={reflection.indexSignatures[0].comment} />

            <Parameter param={extractDeclarationFromType(reflection.indexSignatures[0].type)} />
          </div>
        </section>
      )}

      <Index reflection={reflection as TSDDeclarationReflection} />

      <Members reflection={reflection as TSDDeclarationReflection} />
    </>
  );
}
