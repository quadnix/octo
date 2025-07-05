import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type * as Preset from '@docusaurus/preset-classic';
import type { Config } from '@docusaurus/types';
import { themes as prismThemes } from 'prism-react-renderer';

const __dirname = dirname(fileURLToPath(import.meta.url));

const config: Config = {
  baseUrl: '/',
  favicon: 'img/favicons/favicon.ico',
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },
  markdown: {
    mermaid: true,
  },
  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',
  plugins: [
    'docusaurus-plugin-sass',
    [
      require.resolve('./plugins/typedoc-api/lib'),
      {
        gitRefName: 'main',
        packages: [
          {
            entry: {
              index: 'src/index.ts',
            },
            path: 'packages/octo',
            watchPattern: 'src/**/*.*',
          },
          {
            entry: {
              index: 'src/index.ts',
            },
            path: 'packages/octo-aws-cdk',
            watchPattern: 'src/**/*.*',
          },
        ],
        projectRoot: join(__dirname, '..', '..'),
        typedocOptions: { useTsLinkResolution: true, watch: true },
      },
    ],
  ],
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
    mermaid: {
      options: {},
    },
    navbar: {
      items: [
        {
          label: 'Docs',
          position: 'left',
          sidebarId: 'docsSidebar',
          type: 'docSidebar',
        },
        {
          label: 'API',
          position: 'left',
          to: '/api',
        },
        {
          label: 'Blog',
          position: 'left',
          to: '/blog',
        },
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
