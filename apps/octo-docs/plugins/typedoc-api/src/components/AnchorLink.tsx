import Link from '@docusaurus/Link';
import useBrokenLinks from '@docusaurus/useBrokenLinks';
import type { ReactElement } from 'react';

export interface AnchorLinkProps {
  id: string;
}

export function AnchorLink({ id }: AnchorLinkProps): ReactElement {
  useBrokenLinks().collectAnchor(id);

  return (
    <Link className="tsd-anchor" href={`#${id}`}>
      <span className="tsd-anchor-id" id={id} />
      <i className="codicon codicon-symbol-numeric" />
    </Link>
  );
}
