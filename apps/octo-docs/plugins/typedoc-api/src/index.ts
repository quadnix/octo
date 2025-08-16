import fs from 'fs';
import path from 'path';
import type { Options as MDXLoaderOptions } from '@docusaurus/mdx-loader';
import type { PluginOptions, PropVersionDocs, PropVersionMetadata } from '@docusaurus/plugin-content-docs';
import { CURRENT_VERSION_NAME } from '@docusaurus/plugin-content-docs/server';
import type { LoadContext, Plugin, RouteConfig } from '@docusaurus/types';
import { DEFAULT_PLUGIN_ID, normalizeUrl } from '@docusaurus/utils';
import type { JSONOutput } from 'typedoc';
import {
  flattenAndGroupPackages,
  formatPackagesWithoutHostInfo,
  generateJson,
  loadPackageJsonAndDocs,
} from './plugin/data.js';
import { extractSidebar } from './plugin/sidebar.js';
import { getVersionedDocsDirPath, readVersionsMetadata } from './plugin/version.js';
import type {
  ApiOptions,
  DocusaurusPluginTypeDocApiOptions,
  LoadedContent,
  PackageEntryConfig,
  PackageReflectionGroup,
  ResolvedPackageConfig,
  TSDDeclarationReflection,
  VersionMetadata,
} from './types.js';

const DEFAULT_OPTIONS: Required<DocusaurusPluginTypeDocApiOptions> = {
  banner: '',
  breadcrumbs: true,
  changelogName: 'CHANGELOG.md',
  changelogs: false,
  debug: false,
  disableVersioning: false,
  exclude: [],
  gitRefName: 'master',
  id: DEFAULT_PLUGIN_ID,
  includeCurrentVersion: true,
  lastVersion: '',
  minimal: false,
  onlyIncludeVersions: [],
  packageJsonName: 'package.json',
  packages: [],
  projectDocuments: [],
  projectRoot: '.',
  readmeName: 'README.md',
  readmes: false,
  rehypePlugins: [],
  remarkPlugins: [],
  removeScopes: [],
  routeBasePath: 'api',
  sortPackages: (a, d) => a.packageName.localeCompare(d.packageName),
  sortSidebar: (a, d) => a.localeCompare(d),
  tsconfigName: 'tsconfig.json',
  typedocOptions: {},
  versions: {},
};

async function importFile<T>(file: string): Promise<T> {
  const data = await fs.promises.readFile(file, 'utf8');

  if (file.endsWith('.json')) {
    return JSON.parse(data) as T;
  }

  return data as unknown as T;
}

export default function typedocApiPlugin(
  context: LoadContext,
  pluginOptions: DocusaurusPluginTypeDocApiOptions,
): Plugin<LoadedContent> {
  const options: Required<DocusaurusPluginTypeDocApiOptions> = {
    ...DEFAULT_OPTIONS,
    ...pluginOptions,
  };
  const {
    banner,
    breadcrumbs,
    changelogs,
    id: pluginId,
    gitRefName,
    minimal,
    projectRoot,
    readmes,
    removeScopes,
  } = options;
  const isDefaultPluginId = pluginId === DEFAULT_PLUGIN_ID;
  const versionsMetadata = readVersionsMetadata(context, options as PluginOptions & DocusaurusPluginTypeDocApiOptions);
  const versionsDocsDir = getVersionedDocsDirPath(context.siteDir, pluginId);

  // Determine entry points from configs
  const entryPoints: string[] = [];
  const packageConfigs: ResolvedPackageConfig[] = options.packages.map((pkgItem) => {
    const pkgConfig = typeof pkgItem === 'string' ? { path: pkgItem } : pkgItem;
    const entries: Record<string, PackageEntryConfig> = {};

    if (!pkgConfig.entry || typeof pkgConfig.entry === 'string') {
      entries.index = {
        label: 'Index',
        path: pkgConfig.entry ? String(pkgConfig.entry) : 'src/index.ts',
      };
    } else {
      Object.entries(pkgConfig.entry).forEach(([importPath, entryConfig]) => {
        entries[importPath] =
          typeof entryConfig === 'string'
            ? {
                label: 'Index',
                path: entryConfig,
              }
            : entryConfig;
      });
    }

    Object.values(entries).forEach((entryConfig) => {
      entryPoints.push(path.join(pkgConfig.path, entryConfig.path));
    });

    return {
      entryPoints: entries,
      packageName: '',
      packagePath: pkgConfig.path || '.',
      packageRoot: path.normalize(path.join(projectRoot, pkgConfig.path || '.')),
      packageSlug: pkgConfig.slug ?? path.basename(pkgConfig.path),
      packageVersion: '',
    };
  });

  return {
    configureWebpack(_config, isServer, utils): any {
      if (!readmes && !changelogs) {
        return {
          resolve: {
            symlinks: false,
          },
        };
      }

      // Whitelist the folders that this webpack rule applies to, otherwise we collide with the native
      // docs/blog plugins. We need to include the specific files only, as in polyrepo mode, the `cfg.packagePath`
      // can be project root (where the regular docs are too).
      const include = packageConfigs.flatMap((cfg) => {
        const list: string[] = [];
        if (readmes) {
          list.push(path.join(options.projectRoot, cfg.packagePath, options.readmeName));
        }
        if (changelogs) {
          list.push(path.join(options.projectRoot, cfg.packagePath, options.changelogName));
        }
        return list;
      });

      return {
        module: {
          rules: [
            {
              include,
              test: /\.mdx?$/,
              use: [
                utils.getJSLoader({ isServer }),
                {
                  loader: require.resolve('@docusaurus/mdx-loader'),
                  options: {
                    admonitions: true,
                    // Since this isn't a doc/blog page, we can get
                    // away with it being a partial!
                    isMDXPartial: () => true,
                    markdownConfig: context.siteConfig.markdown,
                    rehypePlugins: options.rehypePlugins,
                    remarkPlugins: options.remarkPlugins,
                    siteDir: context.siteDir,
                    staticDirs: [...context.siteConfig.staticDirectories, path.join(context.siteDir, 'static')],
                  } satisfies MDXLoaderOptions,
                },
                {
                  loader: path.resolve(__dirname, './markdownLoader.js'),
                },
              ],
            },
          ],
        },
      };
    },

    async contentLoaded({ content, actions }): Promise<void> {
      if (!content) {
        return;
      }

      const docs: PropVersionDocs = {};

      // Create an index of versions for quick lookup.
      content.loadedVersions.forEach((loadedVersion) => {
        if (loadedVersion.versionName !== CURRENT_VERSION_NAME) {
          docs[loadedVersion.versionName] = {
            description: loadedVersion.versionLabel,
            id: loadedVersion.versionPath,
            title: loadedVersion.versionLabel,
          };
        }
      });

      const rootRoutes = await Promise.all(
        content.loadedVersions.map(async (loadedVersion) => {
          const version = loadedVersion.versionName;

          // Define version metadata for all pages. We need to use the same structure as
          // "docs" so that we can utilize the same React components.
          const versionMetadata = await actions.createData(
            `version-${version}.json`,
            JSON.stringify({
              badge: loadedVersion.versionBadge,
              banner: loadedVersion.versionBanner,
              className: loadedVersion.versionClassName,
              docs,
              docsSidebars: { api: loadedVersion.sidebars },
              isLast: loadedVersion.isLast,
              label: loadedVersion.versionLabel,
              noIndex: false,
              pluginId,
              version: loadedVersion.versionName,
            } satisfies PropVersionMetadata),
          );

          const packagesData = await actions.createData(
            `packages-${version}.json`,
            JSON.stringify(formatPackagesWithoutHostInfo(loadedVersion.packages)),
          );

          const optionsData = await actions.createData(
            'options.json',
            JSON.stringify({
              banner,
              breadcrumbs,
              gitRefName,
              minimal,
              pluginId,
              scopes: removeScopes,
            } satisfies ApiOptions),
          );

          function createRoute(info: TSDDeclarationReflection, modules?: Record<string, string>): RouteConfig {
            return {
              component: path.join(__dirname, './components/ApiItem.js'),
              exact: true,
              // Map the ID here instead of creating a JSON data file,
              // otherwise this will create thousands of files!
              id: info.id,
              modules,
              path: info.permalink,
              sidebar: 'api',
            };
          }

          const routes: RouteConfig[] = [];

          loadedVersion.packages.forEach((pkg) => {
            pkg.entryPoints.forEach((entry) => {
              const children = entry.reflection.children?.filter((child) => !child.permalink?.includes('#')) ?? [];

              // Map a route for every declaration in the package (the exported APIs)
              const subRoutes = children.map((child) => createRoute(child));

              // Map a top-level package route, otherwise `DocRoot` shows a page not found
              subRoutes.push(
                createRoute(
                  entry.reflection,
                  entry.index && readmes && pkg.readmePath ? { readme: pkg.readmePath } : undefined,
                ),
              );

              if (entry.index && changelogs && pkg.changelogPath) {
                subRoutes.push({
                  component: path.join(__dirname, './components/ApiChangelog.js'),
                  exact: true,
                  modules: { changelog: pkg.changelogPath },
                  path: normalizeUrl([entry.reflection.permalink, 'changelog']),
                  sidebar: 'api',
                });
              }

              routes.push(...subRoutes);
            });
          });

          const indexPermalink = normalizeUrl([loadedVersion.versionPath]);

          if (loadedVersion.packages.length > 1) {
            // Only write out the ApiIndex only when we have multiple packages
            // otherwise we will have 2 top-level entries in the route entries
            routes.push({
              component: path.join(__dirname, './components/ApiIndex.js'),
              exact: true,
              modules: {
                options: optionsData,
                packages: packagesData,
                versionMetadata,
              },
              path: indexPermalink,
              sidebar: 'api',
            });
          }

          for (const document of loadedVersion.documents) {
            if (!document.frontmatter?.path || !loadedVersion.fileEntries[document.id]) {
              continue;
            }
            const documentSourcePath = path.resolve(loadedVersion.fileEntries[document.id]);
            const documentDestinationDirectoryPath = path.join(
              __dirname,
              '../../../docs',
              document.frontmatter.path as string,
            );
            const documentDestinationPath = path.join(
              documentDestinationDirectoryPath,
              path.basename(documentSourcePath),
            );

            const isDocumentExisting = async (): Promise<boolean> => {
              try {
                const existingDocumentSymlink = await fs.promises.lstat(documentDestinationPath);
                return existingDocumentSymlink.isSymbolicLink();
              } catch (error: any) {
                if (error.code === 'ENOENT') {
                  return false;
                }
                throw error;
              }
            };
            const isDocumentExistingResult = await isDocumentExisting();
            if (isDocumentExistingResult) {
              await fs.promises.unlink(documentDestinationPath);
            }

            await fs.promises.mkdir(documentDestinationDirectoryPath, { recursive: true });
            try {
              await fs.promises.symlink(documentSourcePath, documentDestinationPath, 'file');
            } catch (error: any) {
              if (error.code !== 'EEXIST') {
                throw error;
              }
            }
          }

          // Wrap in the `DocVersionRoot` component:
          // https://github.com/facebook/docusaurus/blob/main/packages/docusaurus-plugin-content-docs/src/routes.ts#L192
          return {
            component: '@theme/DocVersionRoot',
            exact: false,
            modules: {
              version: versionMetadata,
            },
            path: indexPermalink,
            priority: loadedVersion.routePriority,
            routes: [
              {
                component: path.join(__dirname, './components/ApiPage.js'),
                exact: false,
                modules: {
                  options: optionsData,
                  packages: packagesData,
                },
                path: indexPermalink,
                routes,
              },
            ],
          };
        }),
      );

      // Wrap in the `DocsRoot` component:
      // https://github.com/facebook/docusaurus/blob/main/packages/docusaurus-plugin-content-docs/src/routes.ts#L232
      actions.addRoute({
        component: '@theme/DocsRoot',
        exact: false,
        path: normalizeUrl([context.baseUrl, options.routeBasePath ?? 'api']),
        routes: rootRoutes,
      });
    },

    extendCli(cli): void {
      const command = isDefaultPluginId ? 'api:version' : `api:version:${pluginId}`;
      const commandDescription = isDefaultPluginId ? 'Tag a new API version' : `Tag a new API version (${pluginId})`;

      cli
        .command(command)
        .arguments('<version>')
        .description(commandDescription)
        .action(async (version) => {
          const outDir = path.join(versionsDocsDir, `version-${version}`);
          const prefix = isDefaultPluginId ? 'api' : pluginId;

          console.log(`[${prefix}]:`, 'Generating docs...');

          await generateJson(projectRoot, entryPoints, path.join(outDir, 'api-typedoc.json'), options);

          console.log(`[${prefix}]:`, 'Persisting packages...');

          // Load info from `package.json`s
          packageConfigs.forEach((cfg) => {
            const { packageJson } = loadPackageJsonAndDocs(
              path.join(options.projectRoot, cfg.packagePath),
              options.packageJsonName,
              options.readmeName,
              options.changelogName,
            );

            cfg.packageName = packageJson.name;
            cfg.packageVersion = packageJson.version;
          });

          await fs.promises.writeFile(path.join(outDir, 'api-packages.json'), JSON.stringify(packageConfigs), 'utf8');

          console.log(`[${prefix}]:`, `version ${version} created!`);
        });
    },

    getPathsToWatch(): string[] {
      return [
        ...options.packages
          .filter((pkg) => typeof pkg === 'object')
          .map((pkg) => path.join(options.projectRoot, pkg.path, pkg.watchPattern || '')),
        ...options.projectDocuments.map((doc) => path.join(options.projectRoot, doc)),
      ];
    },

    async loadContent(): Promise<LoadedContent> {
      const versionsMetadataList = await versionsMetadata;

      return {
        loadedVersions: await Promise.all(
          versionsMetadataList.map(async (metadata: VersionMetadata) => {
            let documents: JSONOutput.DocumentReflection[];
            let fileEntries: Record<string, string>;
            let packages: PackageReflectionGroup[];

            // Current data needs to be generated on demand
            if (metadata.versionName === CURRENT_VERSION_NAME) {
              const outFile = path.join(context.generatedFilesDir, `api-typedoc-${pluginId}.json`);

              await generateJson(projectRoot, entryPoints, outFile, options);

              const output = flattenAndGroupPackages(
                packageConfigs,
                await importFile(outFile),
                metadata.versionPath,
                options,
              );
              documents = output.documents;
              fileEntries = output.fileEntries;
              packages = output.packages;

              // Versioned data is stored in the file system
            } else {
              const outDir = path.join(versionsDocsDir, `version-${metadata.versionName}`);

              const output = flattenAndGroupPackages(
                await importFile(path.join(outDir, 'api-packages.json')),
                await importFile(path.join(outDir, 'api-typedoc.json')),
                metadata.versionPath,
                options,
                true,
              );
              documents = output.documents;
              fileEntries = output.fileEntries;
              packages = output.packages;
            }

            packages.sort((a, d) => options.sortPackages(a, d));

            // Generate sidebars (this runs before the main sidebar is loaded)
            const sidebars = extractSidebar(packages, removeScopes, changelogs, options.sortSidebar);

            await fs.promises.writeFile(
              path.join(context.generatedFilesDir, `api-sidebar-${pluginId}-${metadata.versionName}.js`),
              `module.exports = ${JSON.stringify(sidebars, null, 2)};`,
            );

            await fs.promises.writeFile(
              path.join(context.generatedFilesDir, `api-sidebar-${pluginId}-${metadata.versionName}.d.ts`),
              `import type { SidebarConfig } from '@docusaurus/plugin-content-docs';\nexport = Array<SidebarConfig>;`,
            );

            return {
              ...metadata,
              documents,
              fileEntries,
              packages,
              sidebars,
            };
          }),
        ),
      };
    },

    name: 'docusaurus-plugin-typedoc-api',
  };
}
