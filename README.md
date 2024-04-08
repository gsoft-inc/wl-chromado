# wl-platform-squide-remote-template

-   [Installation](#installation)
-   [Usage](#usage)
-   [Available commands](#available-commands)
-   [CI](#ci)

## Installation

TBD

## Usage

TBD

### Available commands

#### build

Build the library.

```bash
pnpm build
```

#### lint

Lint the files (ESLint, StyleLint and TS types).

```bash
pnpm lint
```

### changeset

To use when you want to publish a new package version. Will display a prompt to fill in the information about your new release.

```bash
pnpm changeset
```

#### clean

Clean the shell packages and the sample application (delete `dist` folder, clear caches, etc..).

```bash
pnpm clean
```

#### reset

Reset the monorepo installation (delete `dist` folders, clear caches, delete `node_modules` folders, etc..).

```bash
pnpm reset
```

#### list-outdated-deps

Checks for outdated dependencies. For more information, view [PNPM documentation](https://pnpm.io/cli/outdated).

```bash
pnpm list-outdated-deps
```

#### update-outdated-deps

Update outdated dependencies to their latest version. For more information, view [PNPM documentation](https://pnpm.io/cli/update).

```bash
pnpm update-outdated-deps
```

## CI

We use [GitHub Actions](https://github.com/features/actions) for this repository.

You can find the configuration in the [.github/workflows](.github/workflows/) folder and the build results are available [here](https://github.com/gsoft-inc/wl-squide/actions).

We currently have 3 builds configured:

### Changesets

This action runs on a push on the `main` branch. If there is a file present in the `.changeset` folder, it will publish the new package version on npm.

### CI

This action will trigger when a commit is done in a PR to `main` or after a push to `main` and will run `build`, `lint-ci` and `test` commands on the source code.

### Retype

This action will trigger when a commit is done in a PR to `main` or after a push to `main`. The action will generate the documentation website into the `retype` branch. This repository [Github Pages](https://github.com/gsoft-inc/wl-web-configs/settings/pages) is configured to automatically deploy the website from the `retype` branch.

If you are having issue with the Retype license, make sure the `RETYPE_API_KEY` Github secret contains a valid Retype license.

