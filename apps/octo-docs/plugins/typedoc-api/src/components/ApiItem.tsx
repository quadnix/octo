import { PageMetadata } from '@docusaurus/theme-common';
import type { Props as DocItemProps } from '@theme/DocItem';
import React, { type ReactElement, useMemo, useState } from 'react';
import { useReflection, useRequiredReflection } from '../hooks/useReflection.js';
import { useReflectionMap } from '../hooks/useReflectionMap.js';
import type { TOCItem, TSDDeclarationReflection, TSDDeclarationReflectionMap } from '../types.js';
import { escapeMdx } from '../utils/helpers.js';
import { getKindIconHtml } from '../utils/icons.js';
import ApiItemLayout from './ApiItemLayout.js';
import { ApiOptionsContext } from './ApiOptionsContext.js';
import { displayPartsToMarkdown } from './Comment.js';
import { Flags } from './Flags.js';
import { Reflection } from './Reflection.js';
import { TypeParametersGeneric } from './TypeParametersGeneric.js';

function extractTOC(
  item: TSDDeclarationReflection,
  map: TSDDeclarationReflectionMap,
  hideInherited: boolean,
): TOCItem[] {
  const toc: TOCItem[] = [];
  const mapped = new Set<string>();

  item.groups?.forEach((group) => {
    group.children?.forEach((childId) => {
      const child = map[childId];
      const shouldShow = child.inheritedFrom ? !hideInherited : true;

      if (!shouldShow || mapped.has(child.name)) {
        return;
      }

      if (!child.permalink || child.permalink.includes('#')) {
        const iconHtml = getKindIconHtml(child.kind, child.name);
        const value = escapeMdx(child.name);

        toc.push({
          id: child.name,
          level: 1,
          value: iconHtml ? `${iconHtml} ${value}` : value,
        });

        mapped.add(child.name);
      }
    });
  });

  return toc;
}

export interface ApiItemProps extends Pick<DocItemProps, 'route'> {
  readme?: React.ComponentType;
}

export default function ApiItem({ readme: Readme, route }: ApiItemProps): ReactElement {
  const [hideInherited, setHideInherited] = useState(false);
  const apiOptions = useMemo(
    () => ({
      hideInherited,
      setHideInherited,
    }),
    [hideInherited, setHideInherited],
  );

  const item = useRequiredReflection((route as unknown as { id: number }).id);
  const reflections = useReflectionMap();
  const toc = useMemo(() => extractTOC(item, reflections, hideInherited), [item, reflections, hideInherited]);

  // Pagination
  const prevItem = useReflection(item.previousId);
  const nextItem = useReflection(item.nextId);
  const pagingMetadata = useMemo(
    () => ({
      next: nextItem
        ? {
            permalink: nextItem.permalink,
            title: escapeMdx(nextItem.name),
          }
        : undefined,
      previous: prevItem
        ? {
            permalink: prevItem.permalink,
            title: escapeMdx(prevItem.name),
          }
        : undefined,
    }),
    [nextItem, prevItem],
  );

  return (
    <ApiOptionsContext.Provider value={apiOptions}>
      <ApiItemLayout
        heading={
          <>
            <span className="tsd-header-flags">
              <Flags flags={item.flags} />
            </span>
            {escapeMdx(item.name)} <TypeParametersGeneric params={item.typeParameters} />
          </>
        }
        pageMetadata={
          <PageMetadata
            description={item.comment?.summary ? displayPartsToMarkdown(item.comment.summary) : ''}
            title={`${item.name} | API`}
          />
        }
        pagingMetadata={pagingMetadata}
        route={route}
        toc={toc}
      >
        {Readme && (
          <section className="tsd-readme">
            <Readme />
          </section>
        )}

        <Reflection reflection={item} />
      </ApiItemLayout>
    </ApiOptionsContext.Provider>
  );
}
