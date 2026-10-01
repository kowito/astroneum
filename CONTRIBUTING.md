# Contributing to Astroneum

Thanks for your interest in improving Astroneum. This document covers the
basics — for the project direction, see the [README](README.md).

## Getting started

```bash
git clone https://github.com/kowito/astroneum.git
cd astroneum
pnpm install
pnpm verify
```

Requirements:

- **Node.js 22** — pinned in [.nvmrc](.nvmrc) (`nvm use`); CI reads the same
  file, and the `engines` field requires ≥ 22.
- **pnpm 10+** (the lockfile is pnpm v10).

`pnpm verify` runs the full gate: `lint → typecheck → build → test`. Every
change must keep this green.

To work on the library against the demo site, run `pnpm dev` from the repo
root. It builds `dist/` on first run, then watches `src/` (JS and styles) and
serves the demo at <http://localhost:3000> with hot reload. Press Ctrl-C to
stop everything.

## Repository layout

| Path | What lives here |
| --- | --- |
| [src/chart](src/chart) | React `AstroneumChart` + all chart features (Heikin-Ashi, Volume Profile, Session Visualizer, ZigZag, multi-TF, templates, position viz, compare overlay, undo manager, P&F, non-time bars, DOM). |
| [src/engine](src/engine) | Core engine: panes, views, widgets, WebGL2/GPU renderers, worker pool, ring buffers, task scheduler. |
| [src/datafeed](src/datafeed) | Reference datafeeds (Polygon, WebSocket, WebTransport, StandardCrypto). |
| [src/extension](src/extension) | Built-in drawing tool overlays (18 tools). |
| [src/plugin](src/plugin) | Public indicator plugin system. |
| [src/scripting](src/scripting) | Sandboxed indicator scripting engine. |
| [src/entries](src/entries) | Subpath export entry points (e.g. `astroneum/replay`). |
| [src/i18n](src/i18n) | 19 locale dictionaries (lazy-loaded on demand). |
| [src/store](src/store) | React state stores (chart, indicator, UI). |
| [src/__tests__](src/__tests__) | All tests (unit, contract, SSR smoke, perf baseline). |
| [demo](demo) | Next.js demo app. |

## Development workflow

1. **Create a branch** off `main`: `git checkout -b feat/<thing>` or
   `fix/<thing>`.
2. **Edit code and tests in lockstep.** New features need at least one
   unit test in [src/__tests__](src/__tests__).
3. **Run the gate locally:** `pnpm verify`.
4. **Run bundle-size check** when changing shipped entries: `pnpm size`.
   If you change `src/engine/workers/TypedArrayIndicators.ts` or
   `indicatorWorker.entry.ts`, run `pnpm gen:worker` to regenerate the worker
   bundle (`pnpm build` does it too; a test fails when it is stale).
   Update [.size-limit.json](.size-limit.json) only with reviewer approval.
5. **Update [CHANGELOG.md](CHANGELOG.md)** under `## [Unreleased]`. Use
   `Added`, `Changed`, `Fixed`, `Deprecated`, `Removed`, `Security`.
6. **Open a PR** targeting `main`.

## Coding conventions

- **TypeScript strict mode** — no `any`, no `as unknown as T` unless there
  is a comment justifying it.
- **No emoji in source or commits.**
- **Comments explain WHY, not WHAT.** Prefer self-documenting names.
- **No side-effect imports** in public entries. The library must be safe to
  evaluate on a Next.js server (SSR smoke test enforces this).
- **2-space indentation, single quotes, no semicolons.** ESLint enforces.
- **Engine core** (`src/engine/**`) is `@ts-nocheck` and excluded from lint.
  Prefer changes in `src/chart/**`, `src/plugin/**`, and `src/datafeed/**`.
- **New chart features** go under `src/chart/` and are imported by the
  consumer via the main `astroneum` entry. Only subpath-specific features go
  in `src/entries/**`.

## Tests

```bash
pnpm test            # one shot
pnpm test:watch      # watch mode
```

We use the **Node.js built-in test runner** via `tsx --test`. No Jest, no
Vitest. Place new tests under [src/__tests__](src/__tests__).

If a test needs the built artifacts (SSR check, bundle inspection), import
from `../../dist/...` and document the dependency in a top-of-file comment;
`pnpm verify` runs `pnpm build` before `pnpm test` to make this safe.

## Adding a new subpath export

1. Create a thin re-export file under `src/entries/<name>.ts`.
2. Add the file to `entry` in [tsup.config.ts](tsup.config.ts).
3. Add an `"./<name>": { ... }` block under `exports` in
   [package.json](package.json).
4. Add a size budget in [.size-limit.json](.size-limit.json).
5. Add an SSR import test in
   [src/__tests__/ssr-smoke.test.ts](src/__tests__/ssr-smoke.test.ts).
6. Document the new entry in [README.md](README.md) and
   [CHANGELOG.md](CHANGELOG.md).

## Adding a new chart feature

1. Create the feature module under `src/chart/FeatureName.ts`.
2. If it's an indicator plugin, implement `IndicatorPlugin<TOutput>` and
   export the plugin object for use with `registerIndicatorPlugin()`.
3. If it's a standalone class, export it and add it to `src/index.ts`.
4. Export any related types from `src/index.ts`.
5. Document in [README.md](README.md) under the relevant section and add
   to [CHANGELOG.md](CHANGELOG.md).

## Reporting bugs

File issues at <https://github.com/kowito/astroneum/issues>. Include:

- The version (`astroneum` package version).
- A minimum reproduction (StackBlitz, CodeSandbox, or a repo).
- Browser + OS + framework versions.
- For runtime crashes: the stack trace.

## Security

Do not file security bugs on the public issue tracker. See
[SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under
the project's [MIT License](LICENSE).
