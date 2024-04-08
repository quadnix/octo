import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/',
  favicon: 'img/favicon.ico',
  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html language. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },
  markdown: {
    mermaid: true,
  },
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',
  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'Quadnix',
  plugins: ['docusaurus-plugin-sass'],
  presets: [
    [
      'classic',
      {
        blog: {
          blogSidebarCount: 'ALL',
          blogSidebarTitle: 'All Posts',
          editUrl: (params): string => {
            const body = `Doc+Path:+\`${params.blogPath}\``;
            return `https://github.com/quadnix/octo/issues/new?labels=octo-docs,documentation&body=${body}`;
          },
          showReadingTime: true,
        },
        docs: {
          editUrl: (params): string => {
            const body = `Doc+Path:+\`${params.docPath}\``;
            return `https://github.com/quadnix/octo/issues/new?labels=octo-docs,documentation&body=${body}`;
          },
          sidebarCollapsed: false,
          sidebarPath: './sidebars.ts',
        },
        theme: {
          customCss: './src/css/custom.scss',
        },
      } satisfies Preset.Options,
    ],
  ],
  projectName: 'Octo',
  themeConfig: {
    footer: {
      copyright: `Copyright © ${new Date().getFullYear()} Quadnix.`,
      links: [
        {
          items: [
            {
              label: 'Docs',
              to: '/docs/introduction',
            },
            {
              label: 'Blog',
              to: '/blog',
            },
          ],
          title: 'Resources',
        },
        {
          items: [
            {
              href: 'https://stackoverflow.com/questions/tagged/docusaurus',
              label: 'Stack Overflow',
            },
            {
              href: 'https://discordapp.com/invite/docusaurus',
              label: 'Discord',
            },
            {
              href: 'https://twitter.com/docusaurus',
              label: 'Twitter',
            },
          ],
          title: 'Community',
        },
        {
          items: [
            {
              href: 'https://github.com/quadnix/octo',
              label: 'GitHub',
            },
          ],
          title: 'More',
        },
      ],
      style: 'dark',
    },
    // Replace with your project's social card
    image: 'img/docusaurus-social-card.jpg',
    navbar: {
      items: [
        {
          label: 'Docs',
          position: 'left',
          sidebarId: 'docsSidebar',
          type: 'docSidebar',
        },
        { label: 'Blog', position: 'left', to: '/blog' },
        {
          href: 'https://github.com/quadnix/octo',
          label: 'GitHub',
          position: 'right',
        },
      ],
      logo: {
        alt: 'Octo Logo',
        src: 'img/logo.svg',
      },
      title: 'Octo',
    },
    prism: {
      darkTheme: prismThemes.oneDark,
      theme: prismThemes.oneDark,
    },
  } satisfies Preset.ThemeConfig,

  themes: ['@docusaurus/theme-mermaid'],
  title: 'Quadnix Octo',
  // Set the production url of your site here
  url: 'https://your-docusaurus-site.example.com',
};

export default config;
