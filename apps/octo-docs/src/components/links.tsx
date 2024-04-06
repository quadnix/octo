const linkMapping: { [key: string]: { displayName: string; href: string } } = {
  blog: {
    displayName: 'Blog',
    href: '/blog',
  },
  model: {
    displayName: 'Models',
    href: '/docs/fundamentals/model',
  },
  resource: {
    displayName: 'Resources',
    href: '/docs/fundamentals/resource',
  },
};

export function Link({ display, id, path = '' }): JSX.Element {
  const mapping = linkMapping[id];
  if (!mapping) {
    throw new Error('Invalid link!');
  }

  return <a href={mapping.href + path}>{display ?? mapping.displayName}</a>;
}
