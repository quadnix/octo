// https://github.com/TypeStrong/typedoc-default-themes/blob/master/src/default/partials/hierarchy.hbs

import type { ReactElement } from 'react';
import type { HierarchyNode } from '../utils/hierarchy.js';
import { Type } from './Type.js';

export interface HierarchyProps {
  tree: HierarchyNode;
}

export function Hierarchy({ tree }: HierarchyProps): ReactElement {
  return (
    <ul className="tsd-hierarchy">
      {tree.types.map((type, i) => (
        <li key={type.type + String(i)}>
          {tree.isTarget ? (
            <em className="tsd-target">{type.type === 'reference' ? type.name : 'UNKNOWN'}</em>
          ) : (
            <Type type={type} />
          )}

          {i === tree.types.length - 1 && tree.next && <Hierarchy tree={tree.next} />}
        </li>
      ))}
    </ul>
  );
}
