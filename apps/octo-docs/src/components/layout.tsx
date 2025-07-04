import type { ReactElement } from 'react';

export function Layout({ children }): ReactElement {
  return <div className="layout-component">{children}</div>;
}
