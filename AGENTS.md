# Repository Guidelines

## Project Structure & Module Organization
This repository is a `pnpm` workspace centered on apps, shared packages, and service runtimes.

- `apps/`: end-user applications such as `stage-web`, `stage-pocket`, `stage-tamagotchi`, and server apps.
- `packages/`: shared UI, pages, runtime helpers, plugins, and cross-app libraries.
- `services/`: standalone integrations and bots such as `minecraft`, `telegram-bot`, and `twitter-services`.
- `docs/`: documentation site and content.
- `crates/`: Rust components built with Cargo.
- `scripts/`, `plugins/`, `patches/`: tooling, extensions, and dependency patches.

Keep tests close to the code they validate, for example `packages/stage-shared/src/memory/index.test.ts`.

## Build, Test, and Development Commands
- `pnpm dev:web`: run the web app locally.
- `pnpm dev:tamagotchi`: run the desktop renderer workflow.
- `pnpm dev:apps`: start all app dev servers in parallel.
- `pnpm build`: build packages and apps through Turbo.
- `pnpm typecheck`: run TypeScript checks across packages, apps, and docs.
- `pnpm test` or `pnpm test:run`: run Vitest with or without watch behavior.
- `pnpm lint` / `pnpm lint:fix`: run the shared lint stack (`moeru-lint`).
- `pnpm build:crates` and `pnpm lint:rust`: build and lint Rust workspace code.

## Coding Style & Naming Conventions
Use the root `.editorconfig`:
- 2 spaces for `ts`, `tsx`, `js`, `vue`, `json`, `yaml`, `css`, and `html`
- 4 spaces for `toml`
- 2 spaces for `rs`
- LF line endings and UTF-8

Prefer TypeScript and Vue SFCs for frontend work. Use `kebab-case` for Vue route/page files, `camelCase` for composables and utilities, and `PascalCase` for Vue components. Run `pnpm lint:fix` before opening a PR.

## Testing Guidelines
Vitest is the primary test runner. Name tests `*.test.ts` and place them beside the implementation or in local `__test__` folders where already established. Add targeted tests for new behavior and regressions, especially in `packages/` and `services/`.

## Commit & Pull Request Guidelines
Recent history favors Conventional Commit prefixes such as `chore(workspace): ...` and `fix(stageui): ...`. Follow that pattern with a scoped, imperative subject.

PRs should include:
- a short problem/solution summary
- linked issues or discussions when relevant
- screenshots or recordings for UI changes
- note of validation performed, such as `pnpm test:run` or `pnpm typecheck`

## Configuration & Safety
Keep secrets in local `.env.local` files and never commit them. Many services depend on provider keys, model endpoints, or local network settings; document any required env vars in the PR when adding a new integration.

## Repository Workflow
This repository is now maintained as a standalone GitHub project under the current owner's account rather than the original upstream history.

- Any code changes from this point forward should be committed to this local repository and pushed to the GitHub remote for this project.
- Do not reconnect this repo to the original `moeru-ai/airi` remote.
- Before finishing substantial work, ensure the relevant changes are committed and ready to push, unless the user explicitly asks to keep them local only.
- Default to updating and verifying the web app workflow.
- Do not rebuild the Windows desktop package after every change; only rerun the `apps/stage-tamagotchi` desktop build when the user explicitly asks for it.
