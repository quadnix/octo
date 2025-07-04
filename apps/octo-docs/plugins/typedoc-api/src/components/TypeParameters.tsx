import type { ReactElement } from 'react';
import type { JSONOutput } from 'typedoc';
import { Comment } from './Comment.js';
import { DefaultValue } from './DefaultValue.js';
import { Type } from './Type.js';

export interface TypeParametersProps {
  params?: JSONOutput.TypeParameterReflection[];
}

export function TypeParameters({ params }: TypeParametersProps): ReactElement | null {
  if (!params || params.length === 0) {
    return null;
  }

  return (
    <ul className="tsd-type-parameters">
      {params.map((param) => (
        <li key={param.id}>
          <strong>{param.name}</strong>

          {param.type && (
            <>
              <span className="tsd-signature-symbol">:</span> <Type type={param.type} />
            </>
          )}

          <DefaultValue comment={param.comment} type={param.type} value={param.default} />

          <Comment comment={param.comment} />
        </li>
      ))}
    </ul>
  );
}
