import type { ReactElement } from 'react';
import type { JSONOutput } from 'typedoc';
import { useReflectionMap } from '../hooks/useReflectionMap.js';
import { hasOwnDocument } from '../utils/visibility.js';
import { AnchorLink } from './AnchorLink.js';
import { Member } from './Member.js';

export interface MembersGroupProps {
  group: JSONOutput.ReflectionGroup;
}

export function MembersGroup({ group }: MembersGroupProps): ReactElement {
  const reflections = useReflectionMap();

  if (group.categories && group.categories.length > 0) {
    return (
      <>
        {group.categories.map((category) => (
          <section key={category.title} className="tsd-panel-group tsd-member-group">
            <h2>
              {category.title === '__CATEGORY__' ? 'Other' : category.title} <AnchorLink id={category.title} />
            </h2>

            {category.children?.map((child) =>
              hasOwnDocument(child, reflections) ? null : <Member key={child} id={child} />,
            )}
          </section>
        ))}
      </>
    );
  }

  return (
    <section className="tsd-panel-group tsd-member-group">
      <h2>
        {group.title} <AnchorLink id={group.title} />
      </h2>

      {group.children?.map((child) => (hasOwnDocument(child, reflections) ? null : <Member key={child} id={child} />))}
    </section>
  );
}
