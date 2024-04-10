---
icon: rocket
expanded: true
---

# Getting started

Welcome to the `@workleap/chromatic-ado` package documentation. In this getting started page, you'll find information about how this package can enhance your [Chromatic](https://www.chromatic.com/) + [Azure Pipelines](https://azure.microsoft.com/en-ca/products/devops/pipelines) integration and how to setup this package for your environment.

## Features

This package aims to offer a workflow similar to the native Chromatic [GitHub integration](https://www.chromatic.com/docs/github-actions/). While it's hardly as good, it will get you up and running with an adequate workflow until Chromatic offers a native Azure Pipelines integration.

### Build notifications

Chromatic Azure Pipelines [documentation](https://www.chromatic.com/docs/azure-pipelines/) explains how to integrate Chromatic within an existing pipeline through its CLI, but it's basically it, there's no build notifications, it's up to you to figure out this part.

This is an important feature of this package, it figures out this part for you by providing build notifications as pull request comments whenever a build is completed:

:::align-image-left
![Pull request notification example](./static/chromatic-pr-notification.png)
:::

### TurboSnap

This package is compatible with [TurboSnap](https://www.chromatic.com/docs/turbosnap/) and will by default trigger Chromatic builds with TurboSnap activated.

### Squash merge

Chromatic doesn't offer any mechanism to support [squash merge](https://learn.microsoft.com/en-us/azure/devops/repos/git/merging-with-squash?view=azure-devops) on Azure DevOps. It means that by default, when using Azure DevOps as a Git provider, if you wish to keep your Chromatic [baselines](https://www.chromatic.com/docs/branching-and-baselines/) up-to-date, you would be constrained to merge your pull requests with regular merge commits. Fortunately, this package implements a workflow based on Chromatic [auto-accept-changes](https://www.chromatic.com/docs/azure-pipelines/#azure-squashrebase-merge-and-the-main-branch) feature, allowing pull requests to complete with squash merges.

Here's how it works:

1. Whenever you create or update a pull request, a Chromatic build will automatically be triggered. If the build fail, the Chromatic pipeline will fail and the team will have to either accept the changes or fix the issues before completing the pull request. If the changes are accepted, unfortunately the `main` branch [baselines](https://www.chromatic.com/docs/branching-and-baselines/) would not be updated.

2. To update the baselines of the `main` branch, once the pull request has been merged, a new Chromatic build will be triggered on the `main` branch. This new build will automatically accepts all the changes (its fine since they have been reviewed in the pull request) and update the `main` branch baselines.

## Setup your workflow

Most of the configurations to support this Chromatic workflow is related to Azure DevOps. First, let's create a new [Chromatic project](#create-a-new-chromatic-project), then, a new [Azure pipeline](#create-a-new-azure-pipeline).

### Create a new Chromatic project

1. Ask the owner of the Chromatic `gsoft-inc-ado` organization to create a new Chromatic project for your application. Make sure to be added as "collaborator" of the new project.

2. Once created, login to [Chromatic](https://www.chromatic.com/) and select your application project from the list.

3. Save your Chromatic project id. The project id is available in the project URL under the `appId` parameter. For example, if your project id is `123`, the project URL would be: `https://www.chromatic.com/manage?appId=123`.

4. In the left sidebar, choose "Manage" and click on the "Configure" tab. Go to the "Project" section and save the project token.

5. With the Chromatic project id and token in hands, process to the next section to create a new [Chromatic Azure pipeline](#create-a-new-azure-pipeline).

### Create a new Azure pipeline

1. First, open your application project and create a new YAML file called `chromatic.yml`. This file will store the configuration of your Chromatic Azure pipeline.

2.1. If your project already includes a [template file](https://learn.microsoft.com/en-us/azure/devops/pipelines/process/templates?view=azure-devops&pivots=templates-includes) to setup your pipelines, then paste the following configuration:

```yaml !#19,22,27,29-30 chromatic.yml
# Run Chromatic on the "main" branch after a pull request has been merged
# (currently required to update the baseline when doing "squash" merge for pull requests).
trigger:
  branches:
    include:
      - main

# Run Chromatic on every pull request targeting the "main" branch as destination.
pr:
  branches:
    include:
      - main

steps:
  # Chromatic needs the full Git history to compare the baselines.
  # Checkout must happen before the setup template.
  - checkout: self
    displayName: Get full Git history
    fetchDepth: 0

  # Your project custom setup template.
  - template: templates/setup.yml

  - task: CmdLine@2
    displayName: Chromatic
    inputs:
      script: pnpm dlx @workleap/chromatic-ado
    env:
      CHROMATIC_PROJECT_TOKEN: $(CHROMATIC_PROJECT_TOKEN)
      CHROMATIC_PULL_REQUEST_COMMENT_ACCESS_TOKEN: $(PULL_REQUEST_COMMENT_ACCESS_TOKEN)
```

2.2. If your project doesn't have a setup template, paste the following configuration:

```yaml #19,54,56-57 chromatic.yml
# Run Chromatic on the "main" branch after a pull request has been merged
# (currently required to update the baseline when doing "squash" merge for pull requests).
trigger:
  branches:
    include:
      - main

# Run Chromatic on every pull request targeting the "main" branch as destination.
pr:
  branches:
    include:
      - main

steps:
  # Chromatic needs the full Git history to compare the baselines.
  # Checkout must happen before the setup template.
  - checkout: self
    displayName: Get full Git history
    fetchDepth: 0

  - task: UseNode@1
    displayName: Use Node.js >=20.0.0
    inputs:
      version: ">=20.0.0"
      checkLatest: true

  - task: Cache@2
    displayName: Cache pnpm
    inputs:
      key: '"pnpm" | "$(Agent.OS)" | pnpm-lock.yaml'
      restoreKeys: |
        "pnpm" | "$(Agent.OS)"
        "pnpm"
      path: $(Pipeline.Workspace)/.pnpm-store

  - script: |
      corepack enable
      corepack prepare pnpm@latest-8 --activate
      pnpm config set store-dir $(Pipeline.Workspace)/.pnpm-store
    displayName: Setup pnpm

  # Optional
  - task: npmAuthenticate@0
    displayName: Authenticate to private npm feed
    inputs:
      workingFile: .npmrc

  - script: pnpm install --frozen-lockfile
    displayName: pnpm install

  - task: CmdLine@2
    displayName: Chromatic
    inputs:
      script: pnpm dlx @workleap/chromatic-ado
    env:
      CHROMATIC_PROJECT_TOKEN: $(CHROMATIC_PROJECT_TOKEN)
      CHROMATIC_PULL_REQUEST_COMMENT_ACCESS_TOKEN: $(PULL_REQUEST_COMMENT_ACCESS_TOKEN)
```

3. Create a new [Azure pipeline from an existing YAML file](https://www.nathannellans.com/post/azure-devops-yaml-pipelines-part-1). Name this new pipeline "Chromatic" (or actually, whichever suits you best).

4. Add the newly created Chromatic pipeline as a **required** [build validation](https://learn.microsoft.com/en-us/azure/devops/repos/git/branch-policies?view=azure-devops&tabs=browser#build-validation) of your `main` branch. Make sure the build validation is **required**, this is important as the visual changes detected by Chromatic will be automatically accepted on the `main` branch.

5. Add the Chromatic project id and token that we saved earlier as [pipeline variables](https://learn.microsoft.com/en-us/azure/devops/pipelines/get-started/yaml-pipeline-editor?view=azure-devops#manage-pipeline-variables) of the newly created Chromatic pipeline. These variables should respectively be named `CHROMATIC_PROJECT_TOKEN` and `CHROMATIC_PULL_REQUEST_COMMENT_ACCESS_TOKEN`. You could also optionally create the `CHROMATIC_PULL_REQUEST_COMMENT_ACCESS_TOKEN` variable as a [variable group](https://learn.microsoft.com/en-us/azure/devops/pipelines/process/set-secret-variables?view=azure-devops&tabs=yaml%2Cbash#set-a-secret-variable-in-a-variable-group).

## Try it :rocket:

-> Locally start a chromatic build and accepts the changes to create a baseline

-> Switch to a branch, make a visual change to a component for which a story is watched by Chromatic and the commit the change

-> A Chromatic build should be automatically triggered and a pull request notifications should be posted with visual changes

- Click on the URL of the build and accept the changes

-> Re-queue the Chromatic pipeline

-> Once it completed with success, complete the PR

-> Another Chromatic build should be triggered on the main branch. The changes should be auto accepted and the pipeline should complete successfully

### Troubleshoot issues

-> Add the debug env var

-> Make sure you have the right Chromatic project token

-> Make sure you have provided the Chromatic project id

-> Make sure your ADO access token is valid and not expired




