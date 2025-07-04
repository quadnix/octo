// https://github.com/TypeStrong/typedoc-default-themes/blob/master/src/default/partials/breadcrumb.hbs

import Link from '@docusaurus/Link';
import React, { type ReactElement } from 'react';
import { useReflection } from '../hooks/useReflection.js';
import type { TSDReflection } from '../types.js';

export interface BreadcrumbProps {
  reflection: TSDReflection;
  root?: boolean;
}

export function Breadcrumb({ reflection, root = true }: BreadcrumbProps): ReactElement | null {
  const parent = useReflection(reflection.parentId);
  let content: React.ReactNode = null;

  if (parent) {
    content = (
      <>
        <Breadcrumb reflection={parent} root={false} />
        <li>
          {reflection.permalink ? (
            <Link to={reflection.permalink}>{reflection.name}</Link>
          ) : (
            <span>{reflection.name}</span>
          )}
        </li>
      </>
    );
  } else if (reflection.permalink) {
    content = (
      <li>
        <Link to={reflection.permalink}>{reflection.name}</Link>
      </li>
    );
  } else {
    return null;
  }

  return root ? <ul className="tsd-breadcrumb">{content}</ul> : <>{content}</>;
}
