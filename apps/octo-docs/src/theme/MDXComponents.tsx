import React from 'react';
import MDXComponents from '@theme-original/MDXComponents';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { library } from '@fortawesome/fontawesome-svg-core';
import { fas } from '@fortawesome/free-solid-svg-icons';

library.add(fas);

/**
 * Source: https://docusaurus.community/knowledge/design/icons/fontawesome/
 * Makes the FontAwesomeIcon component available in MDX as <icon />.
 */
export default {
  ...MDXComponents,
  FAIcon: FontAwesomeIcon,
};
