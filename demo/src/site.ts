/** Where the site is served from: '' locally, '/astroneum' on GitHub Pages. */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

/** URL of a file in demo/public, with the base path applied. */
export function asset(path: string): string {
  return `${BASE_PATH}${path}`
}

export const SITE_ORIGIN = 'https://kowito.github.io'
export const REPO_URL = 'https://github.com/kowito/astroneum'
export const NPM_URL = 'https://www.npmjs.com/package/astroneum'
export const DOCS = {
  api: `${REPO_URL}/blob/main/docs/api.md`,
  datafeeds: `${REPO_URL}/blob/main/docs/datafeed-guide.md`,
  plugins: `${REPO_URL}/blob/main/docs/plugin-development.md`,
  changelog: `${REPO_URL}/blob/main/CHANGELOG.md`,
}
