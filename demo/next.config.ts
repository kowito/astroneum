import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  // astroneum is an ESM-only package — tell Next.js to transpile it so
  // the server-side import path resolves correctly even though the page
  // itself is a client component.
  transpilePackages: ['astroneum'],
  // Silence the workspace-root lockfile warning
  outputFileTracingRoot: path.join(__dirname, '../'),
  // Static export, deployed to GitHub Pages by .github/workflows/demo-pages.yml.
  // A project page is served from /<repo>/, which the workflow passes in; it is
  // empty for `pnpm dev`.
  output: 'export',
  basePath: process.env.PAGES_BASE_PATH ?? '',
  trailingSlash: true,
  images: { unoptimized: true },
}

export default nextConfig
