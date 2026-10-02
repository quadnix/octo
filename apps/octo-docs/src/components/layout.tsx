import type { ReactElement } from 'react';

/**
 * Wraps a page body in the shared layout class.
 */
export function Layout({ children }): ReactElement {
  return <div className="layout-component">{children}</div>;
}
