import Link from '@docusaurus/Link';
import { Fragment, type ReactElement } from 'react';
import type { JSONOutput } from 'typedoc';
import { useReflectionMap } from '../hooks/useReflectionMap.js';
import type { TSDDeclarationReflection } from '../types.js';
import { MemberSignatureTitle } from './MemberSignatureTitle.js';

export function extractDeclarationFromType(
  type?: JSONOutput.Reflection | JSONOutput.SomeType,
): TSDDeclarationReflection | undefined {
  if (!type) {
    return undefined;
  }

  return (type as unknown as { declaration?: TSDDeclarationReflection })?.declaration;
}

function parens(element: ReactElement, needsParens: boolean): ReactElement {
  if (!needsParens) {
    return element;
  }

  return (
    <>
      {needsParens && <span className="tsd-signature-symbol">(</span>}
      {element}
      {needsParens && <span className="tsd-signature-symbol">)</span>}
    </>
  );
}

export interface TypeProps {
  needsParens?: boolean;
  type?: { type: string; value?: unknown };
}

// eslint-disable-next-line complexity
export function Type({ needsParens = false, type: base }: TypeProps): ReactElement | null {
  const reflections = useReflectionMap();

  if (!base) {
    return null;
  }

  // Cast to string since `type` doesn't include all string values in the union.
  // https://github.com/TypeStrong/typedoc/blob/master/src/lib/output/themes/default/partials/type.tsx
  switch (String(base.type)) {
    case 'array': {
      const type = base as JSONOutput.ArrayType;

      return (
        <>
          <Type needsParens type={type.elementType} />
          <span className="tsd-signature-symbol">[]</span>
        </>
      );
    }

    case 'conditional': {
      const type = base as JSONOutput.ConditionalType;

      return parens(
        <>
          <Type needsParens type={type.checkType} />
          <span className="tsd-signature-symbol"> extends </span>
          <Type type={type.extendsType} />
          <span className="tsd-signature-symbol"> ? </span>
          <Type type={type.trueType} />
          <span className="tsd-signature-symbol"> : </span>
          <Type type={type.falseType} />
        </>,
        needsParens,
      );
    }

    case 'indexedAccess': {
      const type = base as JSONOutput.IndexedAccessType;

      return (
        <>
          <Type type={type.objectType} />
          <span className="tsd-signature-symbol">[</span>
          <Type type={type.indexType} />
          <span className="tsd-signature-symbol">]</span>
        </>
      );
    }

    case 'inferred': {
      const type = base as JSONOutput.InferredType;

      return (
        <>
          <span className="tsd-signature-symbol">infer </span> {type.name}
        </>
      );
    }

    case 'intersection': {
      const type = base as JSONOutput.IntersectionType;

      return parens(
        <>
          {type.types.map((t, i) => (
            <Fragment key={t.type + i}>
              {i > 0 && <span className="tsd-signature-symbol"> &amp; </span>}
              <Type needsParens type={t} />
            </Fragment>
          ))}
        </>,
        needsParens,
      );
    }

    case 'intrinsic': {
      const type = base as JSONOutput.IntrinsicType;

      return <span className="tsd-signature-type">{type.name}</span>;
    }

    case 'literal': {
      const type = base as JSONOutput.LiteralType;

      return <span className="tsd-signature-type">{String(type.value)}</span>;
    }

    case 'mapped': {
      const type = base as unknown as JSONOutput.MappedType;

      return (
        <>
          <span className="tsd-signature-symbol">{'{ '}</span>

          {type.readonlyModifier === '+' && <span className="tsd-signature-symbol">readonly </span>}
          {type.readonlyModifier === '-' && <span className="tsd-signature-symbol">-readonly </span>}

          <span className="tsd-signature-symbol">[ </span>
          <span className="tsd-signature-type">{type.parameter}</span>
          <span className="tsd-signature-symbol"> in </span>
          <Type type={type.parameterType} />
          {type.nameType && (
            <>
              <span className="tsd-signature-symbol"> as </span>
              <Type type={type.nameType} />
            </>
          )}
          <span className="tsd-signature-symbol"> ]</span>

          {type.optionalModifier === '+' && <span className="tsd-signature-symbol">?: </span>}
          {type.optionalModifier === '-' && <span className="tsd-signature-symbol">-?: </span>}
          {!type.optionalModifier && <span className="tsd-signature-symbol">: </span>}

          <Type type={type.templateType} />

          <span className="tsd-signature-symbol">{' }'}</span>
        </>
      );
    }

    case 'optional': {
      const type = base as JSONOutput.OptionalType;

      return (
        <>
          <Type type={type.elementType} />
          <span className="tsd-signature-symbol">?</span>
        </>
      );
    }

    case 'predicate': {
      const type = base as JSONOutput.PredicateType;

      return (
        <>
          {type.asserts && <span className="tsd-signature-symbol">asserts </span>}
          <span className="tsd-signature-type">{type.name}</span>
          {type.targetType && (
            <>
              <span className="tsd-signature-symbol"> is </span>
              <Type type={type.targetType} />
            </>
          )}
        </>
      );
    }

    case 'query': {
      const type = base as JSONOutput.QueryType;

      return (
        <>
          <span className="tsd-signature-symbol">typeof </span>
          <Type type={type.queryType} />
        </>
      );
    }

    case 'reference': {
      const type = base as JSONOutput.ReferenceType;
      const ref = type.target ? reflections[Number(type.target)] : null;
      const genericClass = ref?.id && !ref.sources ? 'tsd-signature-type-generic' : '';

      return (
        <>
          {ref?.permalink ? (
            <Link className={`tsd-signature-type ${genericClass}`} data-tsd-kind={ref.kind} to={ref.permalink}>
              {type.name}
            </Link>
          ) : (
            <span className={`tsd-signature-type ${genericClass}`}>{type.name}</span>
          )}
          {type.typeArguments && type.typeArguments.length > 0 && (
            <>
              <span className="tsd-signature-symbol">&lt;</span>
              {type.typeArguments.map((t, i) => (
                <Fragment key={t.type + i}>
                  {i > 0 && <span className="tsd-signature-symbol">, </span>}
                  <Type type={t} />
                </Fragment>
              ))}
              <span className="tsd-signature-symbol">&gt;</span>
            </>
          )}
        </>
      );
    }

    case 'reflection': {
      const type = base as JSONOutput.ReflectionType;
      const declaration = type.declaration;

      // object literal
      if (declaration?.children && declaration.children.length > 0) {
        return (
          <>
            <span className="tsd-signature-symbol">{'{ '}</span>
            {declaration.children.map((child, i) => (
              <Fragment key={child.id ?? i}>
                {i > 0 && <span className="tsd-signature-symbol">; </span>}
                <span>
                  {child.name}
                  <span className="tsd-signature-symbol">{child.flags?.isOptional && '?'}: </span>
                  {child.type ? <Type type={child.type} /> : 'any'}
                </span>
              </Fragment>
            ))}
            <span className="tsd-signature-symbol">{' }'}</span>
          </>
        );
      }

      if (declaration?.signatures && declaration.signatures.length === 1) {
        return <MemberSignatureTitle hideName useArrow sig={declaration.signatures[0]} />;
      }

      if (declaration?.signatures && declaration.signatures.length > 0) {
        return parens(
          <>
            <span className="tsd-signature-symbol">{'{ '}</span>
            {declaration.signatures.map((sig, i) => (
              <Fragment key={sig.id ?? i}>
                {i > 0 && <span className="tsd-signature-symbol">; </span>}
                <MemberSignatureTitle sig={sig} />
              </Fragment>
            ))}
            <span className="tsd-signature-symbol">{' }'}</span>
          </>,
          needsParens,
        );
      }

      return <>{'{}'}</>;
    }

    case 'rest': {
      const type = base as JSONOutput.RestType;

      return (
        <>
          <span className="tsd-signature-symbol">...</span>
          <Type type={type.elementType} />
        </>
      );
    }

    case 'tuple': {
      const type = base as JSONOutput.TupleType;

      return (
        <>
          <span className="tsd-signature-symbol">[</span>
          {type.elements?.map((t, i) => (
            <Fragment key={t.type + i}>
              {i > 0 && <span className="tsd-signature-symbol">, </span>}
              <Type type={t} />
            </Fragment>
          ))}
          <span className="tsd-signature-symbol">]</span>
        </>
      );
    }

    case 'typeOperator': {
      const type = base as JSONOutput.TypeOperatorType;

      return (
        <>
          <span className="tsd-signature-symbol">{type.operator} </span>
          <Type type={type.target} />
        </>
      );
    }

    // case 'typeParameter': {
    // 	const type = base as JSONOutput.TypeParameterType;

    // 	return <span className="tsd-signature-type">{type.name}</span>;
    // }

    case 'union': {
      const type = base as JSONOutput.UnionType;

      return parens(
        <>
          {type.types.map((t, i) => (
            <Fragment key={t.type + i}>
              {i > 0 && <span className="tsd-signature-symbol"> | </span>}
              <Type needsParens type={t} />
            </Fragment>
          ))}
        </>,
        needsParens,
      );
    }

    case 'unknown': {
      const type = base as JSONOutput.UnknownType;

      return <span className="tsd-signature-type">{type.name}</span>;
    }

    case 'named-tuple-member':
    case 'namedTupleMember': {
      const type = base as unknown as JSONOutput.NamedTupleMemberType;

      return (
        <>
          {type.name}
          <span className="tsd-signature-symbol">{type.isOptional ? '?: ' : ': '}</span>
          <Type type={type.element} />
        </>
      );
    }

    case 'template-literal':
    case 'templateLiteral': {
      const type = base as unknown as JSONOutput.TemplateLiteralType;

      return (
        <>
          <span className="tsd-signature-symbol">`</span>
          {type.head && <span className="tsd-signature-type">{type.head}</span>}
          {type.tail.map((t, i) => (
            <Fragment key={i}>
              <span className="tsd-signature-symbol">{'${'}</span>
              {typeof t[0] !== 'string' && <Type type={t[0]} />}
              <span className="tsd-signature-symbol">{'}'}</span>
              {typeof t[1] === 'string' && <span className="tsd-signature-type">{t[1]}</span>}
            </Fragment>
          ))}
          <span className="tsd-signature-symbol">`</span>
        </>
      );
    }

    default:
      return <span className="tsd-signature-type">void</span>;
  }
}
