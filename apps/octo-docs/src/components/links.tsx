import type { ReactElement } from 'react';

const linkMapping: { [key: string]: { displayName: string; href: string } } = {
  blog: {
    displayName: 'Blog',
    href: '/blog',
  },
  model: {
    displayName: 'Models',
    href: '/docs/fundamentals/models',
  },
  resource: {
    displayName: 'Resources',
    href: '/docs/fundamentals/resources',
  },
};

/**
 * Renders a link to a known part of the site by its id, so a moved page is fixed in one place.
 */
export function Link({ display, id, path = '' }): ReactElement {
  const mapping = linkMapping[id];
  if (!mapping) {
    throw new Error('Invalid link!');
  }

  return <a href={mapping.href + path}>{display ?? mapping.displayName}</a>;
}
