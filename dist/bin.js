#!/usr/bin/env node
import { getVariable, setResult, TaskResult } from 'azure-pipelines-task-lib';
import { run as run$1 } from 'chromatic/node';

function getVariables({ accessToken } = {}) {
  return {
    token: accessToken ?? getVariable("System.AccessToken"),
    collectionUri: getVariable("System.CollectionUri"),
    repositoryId: getVariable("Build.Repository.ID"),
    pullRequestId: getVariable("System.PullRequest.PullRequestId")
  };
}
async function getThreads({ accessToken } = {}) {
  const { token, collectionUri, repositoryId, pullRequestId } = getVariables({ accessToken });
  const url = `${collectionUri}/_apis/git/repositories/${repositoryId}/pullRequests/${pullRequestId}/threads?api-version=7.1-preview.1`;
  const response = await fetch(url, {
    headers: {
      "Authorization": `Basic ${btoa(`:${token}`)}`
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch threads. Status: ${response.status}`);
  }
  const result = await response.json();
  return result.value ?? [];
}
async function createThread(content, { id, accessToken } = {}) {
  const { token, collectionUri, repositoryId, pullRequestId } = getVariables({ accessToken });
  const url = `${collectionUri}/_apis/git/repositories/${repositoryId}/pullRequests/${pullRequestId}/threads?api-version=7.1-preview.1`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${btoa(`:${token}`)}`
    },
    body: JSON.stringify({
      status: "Unknown",
      properties: { id },
      comments: [
        {
          commentType: 2 /* CodeChange */,
          content
        }
      ]
    })
  });
  if (!response.ok) {
    throw new Error(`Failed to create thread. Status: ${response.status}`);
  }
}
async function editThread(content, threadId, commentId, { accessToken } = {}) {
  const { token, collectionUri, repositoryId, pullRequestId } = getVariables({ accessToken });
  const url = `${collectionUri}/_apis/git/repositories/${repositoryId}/pullRequests/${pullRequestId}/threads/${threadId}/comments/${commentId}?api-version=7.1-preview.1`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${btoa(`:${token}`)}`
    },
    body: JSON.stringify({
      commentType: 2 /* CodeChange */,
      content
    })
  });
  if (response.status !== 200) {
    throw new Error(`Failed to edit threads. Status: ${response.status}`);
  }
}
async function postThread(content, { id, accessToken } = {}) {
  const { pullRequestId } = getVariables();
  if (!pullRequestId) {
    return;
  }
  try {
    let match = void 0;
    if (id) {
      const threads = await getThreads({ accessToken });
      match = threads.find((thread) => !thread.isDeleted && thread.properties?.id?.$value === id);
    }
    if (match) {
      await editThread(content, match.id, 1, { accessToken });
    } else {
      await createThread(content, { id, accessToken });
    }
  } catch (error) {
    throw new Error(`Could not post comment. Make sure the Project Collection Build Service Accounts has the 'Contribute to pull requests' permission set to 'Allowed'. ${error}`);
  }
}

// src/bin.ts
async function run() {
  try {
    const isDebug = getVariable("CHROMATIC_DEBUG");
    if (isDebug) {
      console.log("DEBUG IS ON");
    }
    if (!getVariable("CHROMATIC_PULL_REQUEST_COMMENT_ACCESS_TOKEN")) {
      console.error("CHROMATIC_PULL_REQUEST_COMMENT_ACCESS_TOKEN is missing");
    }
    const argv = process.argv.slice(2);
    if (argv.includes("--only-changed")) {
      console.error("--only-changed is added by default by @workleap/chromado.");
      setResult(TaskResult.Failed, "--only-changed is added by default by @workleap/chromado.");
      return;
    }
    if (argv.includes("--auto-accept-changes")) {
      console.error("--auto-accept-changes is already handled by @workleap/chromado.");
      setResult(TaskResult.Failed, "--auto-accept-changes is already handled by @workleap/chromado.");
      return;
    }
    if (argv.includes("--debug")) {
      console.error('--debug is bot supported by @workleap/chromado. Provide a "CHROMATIC_DEBUG" environment variable instead.');
      setResult(TaskResult.Failed, '--debug is bot supported by @workleap/chromado. Provide a "CHROMATIC_DEBUG" environment variable instead.');
      return;
    }
    if (!getVariable("CHROMATIC_DISABLE_TURBOSNAP")) {
      argv.push("--only-changed");
    }
    const isAutoAcceptingChangesOnMainBranch = getVariable("Build.Reason") !== "PullRequest" && getVariable("Build.SourceBranch") === "refs/heads/main";
    if (isAutoAcceptingChangesOnMainBranch) {
      argv.push("--auto-accept-changes", "main");
    }
    if (!argv.includes("--skip")) {
      argv.push("--skip", "renovate/**", "changeset-release/**");
    }
    if (isDebug) {
      argv.push("--debug");
    }
    if (isDebug) {
      console.log("[chromado] Running Chromatic with the following arguments: ", argv.join(", "));
    }
    const output = await run$1({ argv });
    if (isDebug) {
      console.log(`[chromado] Chromatic exited with the following output: ${JSON.stringify(output, null, 2)}.`);
    }
    if (output.code !== 0 && output.code !== 1 && output.code !== 2) {
      console.error(`Chromatic exited with code "${output.code}". For additional information about Chromatic exit codes, view: https://www.chromatic.com/docs/cli/#exit-codes.`);
      setResult(TaskResult.Failed, `Chromatic exited with code "${output.code}". For additional information about Chromatic exit codes, view: https://www.chromatic.com/docs/cli/#exit-codes.`);
      return;
    }
    if (output.url === void 0 && output.storybookUrl === void 0) {
      console.error("A build for the same commit as the last build on the branch is considered a rebuild. You can override this using the --force-rebuild flag.");
      setResult(TaskResult.Succeeded, "A build for the same commit as the last build on the branch is considered a rebuild. You can override this using the --force-rebuild flag.");
      return;
    }
    if (isAutoAcceptingChangesOnMainBranch) {
      if (isDebug) {
        const message = output.changeCount > 0 ? `${output.changeCount} visual ${output.changeCount === 1 ? "change" : "changes"} has been automatically accepted.` : "";
        console.log(`[chromado] ${message}`);
      }
      return;
    }
    const comment = `
### ${output.errorCount > 0 || output.changeCount > 0 ? "\u274C" : "\u2705"} Chromatic

<div>
    <table>
    <tbody>
        <tr>
        <td>\u{1F528} Latest commit:</td>
        <td>${getVariable("Build.SourceVersion")}</td>
        </tr>
        <tr>
        <td>\u{1F4A5} Component errors:</td>
        <td>
${output.errorCount === 0 ? "\u2705&nbsp; None" : `\u274C&nbsp; ${output.errorCount} ${output.errorCount === 1 ? "error" : "errors"}`}
        </td>
        </tr>
        <tr>
        <td>\u2728 Visual changes:</td>
        <td>
${output.changeCount === 0 ? "\u2705&nbsp; None" : `\u274C&nbsp; Found ${output.changeCount} visual ${output.changeCount === 1 ? "change" : "changes"}`}
        </tr>
        <tr>
        <td>\u{1F50D} Build URL:</td>
        <td>
        <a href="${output.buildUrl}" target="_blank" aria-label="${output.buildUrl} (Opens in a new window or tab)">${output.buildUrl}</a>
        <span class="fabric-icon ms-Icon--NavigateExternalInline font-size" role="presentation" aria-hidden="true"></span>
        </td>
        </tr>
        <tr>
        <td>\u{1F3A8} Storybook URL:</td>
        <td>
        <a href="${output.storybookUrl}" target="_blank" arial-label="${output.storybookUrl} (Opens in a new window or tab)">${output.storybookUrl}</a>
        <span class="fabric-icon ms-Icon--NavigateExternalInline font-size" role="presentation" aria-hidden="true"></span>
        </td>
        </tr>
    </tbody>
    </table>
</div>
`;
    console.log("Posting comment to thread...");
    await postThread(comment, {
      id: "CHROMATIC_THREAD_ID",
      accessToken: getVariable("CHROMATIC_PULL_REQUEST_COMMENT_ACCESS_TOKEN")
    });
    if (output.errorCount > 0) {
      console.error(`${output.errorCount} ${output.errorCount === 1 ? "test" : "tests"} failed.`);
      setResult(TaskResult.Failed, `${output.errorCount} ${output.errorCount === 1 ? "test" : "tests"} failed.`);
    }
    if (output.changeCount > 0) {
      console.log(`Found ${output.changeCount} visual ${output.changeCount === 1 ? "change" : "changes"}. Review the ${output.changeCount === 1 ? "change" : "changes"} and re-queue the build to proceed.`);
      const message = `Found ${output.changeCount} visual ${output.changeCount === 1 ? "change" : "changes"}. Review the ${output.changeCount === 1 ? "change" : "changes"} and re-queue the build to proceed.`;
      setResult(TaskResult.Failed, message);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
      setResult(TaskResult.Failed, error.message);
    } else {
      console.error(`An unknown error occured: ${error}`);
      setResult(TaskResult.Failed, `An unknown error occured: ${error}`);
    }
  }
}
run().then(() => process.exit(0)).catch(() => process.exit(1));
