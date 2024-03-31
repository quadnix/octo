import IconExternalLink from '@theme/Icon/ExternalLink';
import React from 'react';
import Translate from '@docusaurus/Translate';
import { ThemeClassNames } from '@docusaurus/theme-common';
import Link from '@docusaurus/Link';
import type { Props } from '@theme/EditThisPage';

/**
 * This is a swizzled version of the default EditThisPage button.
 * https://docusaurus.io/docs/swizzling#ejecting
 *
 * This component needs to be swizzled on every Docusaurus upgrade.
 * **Swizzle Command**: `npm run swizzle @docusaurus/theme-classic EditThisPage -- --eject`
 */
export default function EditThisPage({ editUrl }: Props): JSX.Element {
  return (
    <>
      <br />
      Any questions or concerns about this page?
      <br />
      <Link to={editUrl} className={ThemeClassNames.common.editThisPage}>
        <IconExternalLink /> &nbsp;
        <Translate id="theme.common.editThisPage" description="The link label to open a GitHub issue.">
          Create a GitHub issue
        </Translate>
      </Link>
    </>
  );
}
