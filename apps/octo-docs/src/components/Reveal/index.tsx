import clsx from 'clsx';
import React, { type ReactElement, type ReactNode } from 'react';

import styles from './styles.module.scss';

interface RevealOptions {
  children: ReactNode;
  className?: string;
}

/**
 * Fades its children in as they scroll into view.
 *
 * The entrance is a CSS scroll-driven animation with no script behind it. Where the browser does
 * not support one, the children are simply visible, so nothing on the page can ever be left
 * hidden by an animation that did not run.
 */
export default function Reveal({ children, className }: RevealOptions): ReactElement {
  return <div className={clsx(styles.reveal, className)}>{children}</div>;
}
