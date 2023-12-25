const linkMapping = {
  model: {
    displayName: 'Models',
    href: '/docs/fundamentals/model',
  },
  resource: {
    displayName: 'Resources',
    href: '/docs/fundamentals/resource',
  },
};

export function Link({ id, display }): JSX.Element {
  const mapping = linkMapping[id];
  if (!mapping) {
    throw new Error('Invalid link!');
  }

  return <a href={mapping.href}>{display ?? mapping.displayName}</a>;
}
