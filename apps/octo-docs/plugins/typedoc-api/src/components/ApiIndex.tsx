import Link from '@docusaurus/Link';
import type { PropVersionMetadata } from '@docusaurus/plugin-content-docs';
import { type GlobalVersion, useDocsPreferredVersion, useDocsVersion } from '@docusaurus/plugin-content-docs/client';
import type { Props as DocItemProps } from '@theme/DocItem';
import Heading from '@theme/Heading';
import { type ReactElement, useEffect } from 'react';
import type { ApiOptions, PackageReflectionGroup } from '../types.js';
import { removeScopes } from '../utils/links.js';
import { Footer } from './Footer.js';
import { VersionBanner } from './VersionBanner.js';

export interface ApiIndexProps extends Pick<DocItemProps, 'route'> {
  history: {
    location: { pathname: string };
    replace: (path: string) => void;
  };
  options: ApiOptions;
  packages: PackageReflectionGroup[];
}

function addVersionToUrl(
  url: string,
  latestVersion: PropVersionMetadata,
  preferredVersion: GlobalVersion | null | undefined,
): string {
  if (
    !url.match(/api\/([\d.]+)/) &&
    !url.includes('api/next') &&
    preferredVersion &&
    preferredVersion.name !== latestVersion.version
  ) {
    const version = preferredVersion.name === 'current' ? 'next' : preferredVersion.name;

    if (url.endsWith('/api')) {
      return `${url}/${version}`;
    }

    return url.replace('/api/', `/api/${version}/`);
  }

  return url;
}

export default function ApiIndex({ options, packages, history }: ApiIndexProps): ReactElement {
  const latestVersion = useDocsVersion();
  const { preferredVersion } = useDocsPreferredVersion(latestVersion.pluginId);

  useEffect(() => {
    // Redirect to package when only 1
    if (packages.length === 1) {
      history.replace(
        addVersionToUrl(packages[0].entryPoints[0].reflection.permalink, latestVersion, preferredVersion),
      );

      // Redirect to preferred version
    } else if (preferredVersion) {
      history.replace(addVersionToUrl(history.location.pathname, latestVersion, preferredVersion));
    }
  }, [packages, history, latestVersion, preferredVersion]);

  return (
    <div className="row">
      <div className="col apiItemCol">
        {options.banner && (
          <div className="alert alert--info margin-bottom--md" role="alert">
            <div dangerouslySetInnerHTML={{ __html: options.banner }} />
          </div>
        )}

        <VersionBanner />

        <div className="apiItemContainer">
          <article>
            <div className="markdown">
              <header>
                <Heading as="h1">API</Heading>
              </header>

              <section className="tsd-panel">
                <h3 className="tsd-panel-header">Packages</h3>
                <div className="tsd-panel-content">
                  <ul className="tsd-index-list">
                    {packages.map((pkg) => (
                      <li key={pkg.packageName} className="tsd-truncate">
                        <Link className="tsd-kind-icon" to={pkg.entryPoints[0].reflection.permalink}>
                          <span className="tsd-signature-symbol">v{pkg.packageVersion}</span>{' '}
                          <span>{removeScopes(pkg.packageName, options.scopes)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            </div>

            <Footer />
          </article>
        </div>
      </div>
    </div>
  );
}
