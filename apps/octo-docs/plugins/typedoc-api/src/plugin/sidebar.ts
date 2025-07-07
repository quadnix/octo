import { normalizeUrl } from '@docusaurus/utils';
import { type JSONOutput, type ReflectionId } from 'typedoc';
import type {
  DocusaurusPluginTypeDocApiOptions,
  PackageReflectionGroup,
  SidebarItem,
  TSDDeclarationReflection,
  TSDDeclarationReflectionMap,
} from '../types.js';
import { removeScopes } from '../utils/links.js';
import { createReflectionMap } from './data.js';

export function groupSidebarItems(
  map: TSDDeclarationReflectionMap,
  groups: JSONOutput.ReflectionGroup[],
): SidebarItem[] {
  const items: SidebarItem[] = [];
  const sortedGroups = groups.sort((a, b) => a.title.localeCompare(b.title));

  function getLastItemInGroup(index: number): ReflectionId | undefined {
    const length = sortedGroups[index]?.children?.length;

    return length ? sortedGroups[index]?.children?.[length - 1] : undefined;
  }

  sortedGroups.forEach((group, groupIndex) => {
    const { children } = group;

    if (!children || children.length === 0) {
      return;
    }

    const parts = group.title.split('/');
    const item: SidebarItem = {
      collapsed: true,
      collapsible: true,
      items: children.map((id, index) => {
        const child = map[id];

        // We map previous/next from here since the sidebar is grouped by type,
        // and we only want to link based on this order.
        const previousId = index === 0 ? getLastItemInGroup(groupIndex - 1) : children[index - 1];
        const nextId = index === children.length - 1 ? groups[groupIndex + 1]?.children?.[0] : children[index + 1];

        if (previousId) {
          child.previousId = previousId;
        }

        if (nextId) {
          child.nextId = nextId;
        }

        return {
          href: child.permalink,
          label: child.name,
          type: 'link',
        };
      }),
      label: parts[parts.length - 1],
      type: 'category',
    };

    let previousItem: SidebarItem = item;
    let shouldInsertNewItem = true;
    for (let i = parts.length - 2; i >= 0; i--) {
      const label = parts[i];
      const existingItem = items.findIndex((i) => (i as any).label === label);
      if (existingItem > -1) {
        (items[existingItem] as any).items.push(previousItem);
        shouldInsertNewItem = false;
        break;
      } else {
        previousItem = {
          collapsed: true,
          collapsible: true,
          items: [previousItem],
          label: parts[i],
          type: 'category',
        };
      }
    }

    if (shouldInsertNewItem) {
      items.push(previousItem);
    }
  });

  return items;
}

export function extractReflectionSidebar(pkg: TSDDeclarationReflection): SidebarItem[] {
  return pkg.groups ? groupSidebarItems(createReflectionMap(pkg.children), pkg.groups) : [];
}

export function extractSidebar(
  packages: PackageReflectionGroup[],
  scopes: string[],
  changelogs: boolean,
  sortSidebar: NonNullable<DocusaurusPluginTypeDocApiOptions['sortSidebar']>,
): SidebarItem[] {
  if (packages.length === 0) {
    return [];
  }

  const items: SidebarItem[] = packages.map((pkg) => {
    let subItems: SidebarItem[] = [];

    pkg.entryPoints.forEach((entry) => {
      // Index entry point should always bubble up reflection groups
      if (entry.index) {
        subItems.push(...extractReflectionSidebar(entry.reflection));
        // Otherwise nest non-index entry points behind categories
      } else {
        subItems.push({
          collapsed: true,
          collapsible: true,
          items: extractReflectionSidebar(entry.reflection),
          label: entry.label,
          type: 'category',
        });
      }
    });

    // Always include the overview as the 1st item
    const indexHref = pkg.entryPoints.find((entry) => entry.index)?.reflection.permalink ?? '';

    subItems = subItems.sort((a, d) => sortSidebar('label' in a ? a.label : '', 'label' in d ? d.label : ''));

    subItems.unshift({
      href: indexHref,
      label: 'Overview',
      type: 'link',
    });

    if (pkg.changelogPath && changelogs) {
      subItems.push({
        href: normalizeUrl([indexHref, 'changelog']),
        label: 'Changelog',
        type: 'link',
      });
    }

    return {
      collapsed: true,
      collapsible: true,
      items: subItems,
      label: removeScopes(pkg.packageName, scopes),
      type: 'category',
    } as const;
  });

  const sidebar = items.filter((item) => 'items' in item && items.length > 0);

  // Collapse sidebar when only 1 package
  if (packages.length === 1 && sidebar.length === 1 && sidebar[0].type === 'category') {
    return sidebar[0].items;
  }

  return sidebar;
}
