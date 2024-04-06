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
  plugins: ['docusaurus-plugin-sass'],
  presets: [
    [
      'classic',
      {
        blog: false,
        docs: {
          // Please change this to your repository.
          // Remove this to remove the "edit this page" links.
          editUrl: 'https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/',
          sidebarPath: './sidebars.ts',
        },
        theme: {
          customCss: './src/css/custom.scss',
        },
      } satisfies Preset.Options,
    ],
  ],
  projectName: 'Octo Contribution Docs',
  tagline: 'Dinosaurs are cool',
  themeConfig: {
    footer: {
      copyright: `Copyright © ${new Date().getFullYear()} Quadnix.`,
      links: [
        {
          items: [
            {
              label: 'Tutorial',
              to: '/docs/introduction',
            },
          ],
          title: 'Docs',
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
          label: 'Tutorial',
          position: 'left',
          sidebarId: 'tutorialSidebar',
          type: 'docSidebar',
        },
        {
          href: 'https://github.com/quadnix/octo',
          label: 'GitHub',
          position: 'right',
        },
      ],
      logo: {
        alt: 'My Site Logo',
        src: 'img/logo.svg',
      },
      title: 'Octo',
    },
    prism: {
      darkTheme: prismThemes.vsDark,
      theme: prismThemes.vsDark,
    },
  } satisfies Preset.ThemeConfig,

  themes: ['@docusaurus/theme-mermaid'],
  title: 'Quadnix Octo',
  // Set the production url of your site here
  url: 'https://your-docusaurus-site.example.com',
};

export default config;
