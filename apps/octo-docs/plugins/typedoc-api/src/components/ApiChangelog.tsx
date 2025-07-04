import { PageMetadata } from '@docusaurus/theme-common';
import type { Props as DocItemProps } from '@theme/DocItem';
import type { ReactElement } from 'react';
import type { TOCItem } from '../types.js';
import ApiItemLayout from './ApiItemLayout.js';

export interface ApiChangelogProps extends Pick<DocItemProps, 'route'> {
  changelog: DocItemProps['content'];
}

const emptyToc: TOCItem[] = [];

export default function ApiChangelog({ changelog: Changelog, route }: ApiChangelogProps): ReactElement {
  return (
    <ApiItemLayout
      heading="Changelog"
      pageMetadata={<PageMetadata description={Changelog.contentTitle} title="Changelog | API" />}
      route={route}
      toc={Changelog.toc ?? emptyToc}
    >
      <section className="tsd-readme">
        <Changelog />
      </section>
    </ApiItemLayout>
  );
}
