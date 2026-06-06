// @ts-check
import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import starlightLlmsTxt from 'starlight-llms-txt'

// pdcli — Astro + Starlight config for GitHub Pages (project site)
// Live URL: https://wavyx.github.io/pdcli
export default defineConfig({
  site: 'https://wavyx.github.io',
  base: '/pdcli',

  // GFM tables in .md/.mdx (the MDX pipeline inherits these classic options,
  // unlike a custom `processor`); smartypants off so code examples keep
  // literal `--flags` and straight quotes.
  markdown: { gfm: true, smartypants: false },

  integrations: [
    starlight({
      title: 'pdcli',
      description:
        'A fast, scriptable CLI for Pipedrive — terminals, CI, and AI agents.',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/wavyx/pdcli',
        },
      ],
      editLink: {
        baseUrl: 'https://github.com/wavyx/pdcli/edit/main/website/',
      },
      // Social cards — twitter:card summary_large_image needs an image.
      head: [
        {
          tag: 'meta',
          attrs: {
            property: 'og:image',
            content: 'https://wavyx.github.io/pdcli/og.png',
          },
        },
        {
          tag: 'meta',
          attrs: {
            name: 'twitter:image',
            content: 'https://wavyx.github.io/pdcli/og.png',
          },
        },
      ],
      // "Clarity" design system (designer handoff) — tokens + homepage.
      customCss: ['./src/styles/theme.css', './src/styles/home.css'],
      components: {
        Header: './src/components/Header.astro',
        Footer: './src/components/Footer.astro',
        // Light-first default (stored user choice always wins).
        ThemeProvider: './src/components/ThemeProvider.astro',
      },
      // Code blocks stay terminal-dark in BOTH themes (design signature).
      expressiveCode: {
        themes: ['github-dark'],
        useStarlightDarkModeSwitch: false,
        useStarlightUiThemeColors: false,
        styleOverrides: {
          borderRadius: '14px',
          borderColor: '#1b2b22',
          codeBackground: '#0c1611',
          codeFontFamily:
            "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, monospace",
          frames: {
            terminalBackground: '#0c1611',
            terminalTitlebarBackground: '#0c1611',
            editorBackground: '#0c1611',
            editorTabBarBackground: '#0c1611',
            shadowColor: 'transparent',
          },
        },
      },
      plugins: [
        // /llms.txt, /llms-full.txt, /llms-small.txt for AI agents
        starlightLlmsTxt(),
      ],
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'Installation', slug: 'start/installation' },
            { label: 'Quickstart', slug: 'start/quickstart' },
            { label: 'Quickstart for AI agents', slug: 'start/agents' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Authentication', slug: 'guides/authentication' },
            { label: 'Profiles & configuration', slug: 'guides/configuration' },
            { label: 'Custom fields', slug: 'guides/custom-fields' },
            { label: 'Bulk operations & CSV import', slug: 'guides/bulk' },
            {
              label: 'Deal products (line items)',
              slug: 'guides/deal-products',
            },
            {
              label: 'Relations: participants, followers, org hierarchy',
              slug: 'guides/relations',
            },
            { label: 'Full-account backup', slug: 'guides/backup' },
            { label: 'Sales analytics', slug: 'guides/analytics' },
            { label: 'Data-hygiene audit', slug: 'guides/audit' },
            { label: 'The raw api escape hatch', slug: 'guides/api' },
          ],
        },
        {
          label: 'Automation',
          items: [
            { label: 'Output & filtering', slug: 'automation/output' },
            { label: 'Exit codes', slug: 'automation/exit-codes' },
            { label: 'CI recipes', slug: 'automation/ci' },
            { label: 'Cookbook', slug: 'automation/cookbook' },
          ],
        },
        {
          label: 'Concepts',
          items: [
            {
              label: 'How pdcli talks to Pipedrive',
              slug: 'concepts/api-model',
            },
            { label: 'Security model', slug: 'concepts/security' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'Commands', slug: 'reference/commands' },
            { label: 'Config & environment', slug: 'reference/config' },
            { label: 'Troubleshooting', slug: 'reference/troubleshooting' },
            { label: 'Contributing', slug: 'contributing' },
            {
              label: 'Changelog (GitHub)',
              link: 'https://github.com/wavyx/pdcli/releases',
            },
          ],
        },
      ],
    }),
  ],
})
