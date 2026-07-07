import type { MDXPlugin } from '@docusaurus/mdx-loader';
import type { PropSidebarItem, VersionBanner, VersionsOptions } from '@docusaurus/plugin-content-docs';
import type { JSONOutput, TypeDocOptions } from 'typedoc';

export type { VersionBanner };

export interface DocusaurusPluginTypeDocApiOptions
  extends Omit<VersionsOptions, 'disableVersioning' | 'includeCurrentVersion'> {
  banner?: string;
  breadcrumbs?: boolean;
  changelogName?: string;
  changelogs?: boolean;
  debug?: boolean;
  // Versioning, based on Docusaurus
  disableVersioning?: boolean;
  exclude?: string[];
  gitRefName?: string;
  id?: string;
  includeCurrentVersion?: boolean;
  minimal?: boolean;
  packageJsonName?: string;
  packages: (PackageConfig | string)[];
  projectDocuments?: string[];
  projectRoot: string;
  readmeName?: string;
  readmes?: boolean;
  rehypePlugins: MDXPlugin[];
  remarkPlugins: MDXPlugin[];

  removeScopes?: string[];
  routeBasePath?: string;

  sortPackages?: (a: PackageReflectionGroup, d: PackageReflectionGroup) => number;
  sortSidebar?: (a: string, d: string) => number;
  tsconfigName?: string;
  typedocOptions?: Partial<TypeDocOptions>;
}

// CONFIG

export interface PackageEntryConfig {
  label: string;
  path: string;
}

export interface PackageConfig {
  entry?: Record<string, PackageEntryConfig | string> | string;
  includeProjectDocuments?: boolean;
  path: string; // Folder relative to project root
  slug?: string;
  watchPattern?: string;
}

export interface ResolvedPackageConfig {
  entryPoints: Record<string, PackageEntryConfig>;
  packageName: string;
  packagePath: string;
  packageRoot: string;
  packageSlug: string;
  packageVersion: string;
}

// VERSIONING

export interface VersionMetadata {
  isLast: boolean;
  routePriority: number | undefined; // -1 for the latest
  versionBadge: boolean;
  versionBanner: VersionBanner | null;
  versionClassName: string;
  versionLabel: string; // Version 1.0.0
  versionName: string; // 1.0.0
  versionPath: string; // /baseUrl/api/1.0.0
}

export interface LoadedVersion extends VersionMetadata {
  // mainDocId: string;
  documents: JSONOutput.DocumentReflection[];
  fileEntries: Record<string, string>;
  packages: PackageReflectionGroup[];
  sidebars: SidebarItem[];
}

export interface LoadedContent {
  loadedVersions: LoadedVersion[];
}

// SIDEBAR / UI

export type SidebarItem = PropSidebarItem;

export interface ApiOptions {
  banner: string;
  breadcrumbs: boolean;
  gitRefName: string;
  minimal: boolean;
  pluginId: string;
  scopes: string[];
}

export interface TOCItem {
  readonly id: string;
  readonly level: number;
  readonly value: string;
}

// REFLECTIONS

export interface PackageReflectionGroupEntry {
  index: boolean;
  label: string;
  reflection: TSDDeclarationReflection;
  urlSlug: string;
}

export interface PackageReflectionGroup {
  changelogPath?: string;
  entryPoints: PackageReflectionGroupEntry[];
  packageName: string;
  packageVersion: string;
  readmePath?: string;
}

export interface ApiMetadata {
  id: number;
  name: string;
  nextId?: number;
  permalink: string;
  previousId?: number;
}

// TYPEDOC COMPAT

export interface TSDReflection extends Omit<JSONOutput.Reflection, 'signatures'>, Omit<ApiMetadata, 'id'> {
  // Added by us for convenience
  parentId?: number;
  signatures: TSDSignatureReflection[];
}

export interface TSDDeclarationReflection
  extends Omit<JSONOutput.DeclarationReflection, 'children' | 'signatures'>,
    Omit<ApiMetadata, 'id'> {
  children?: TSDDeclarationReflection[];
  signatures: TSDSignatureReflection[];
}

export type TSDDeclarationReflectionMap = Record<number, TSDDeclarationReflection>;

export interface TSDSignatureReflection extends JSONOutput.SignatureReflection {
  // declaration: TSDDeclarationReflection;
}

declare global {
  var typedocBuild: { count: number };
}
