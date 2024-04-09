#!/usr/bin/env node

/**
 * This script is heavily inspired by the official Chromatic Github Action.
 * @see https://github.com/chromaui/chromatic-cli/blob/main/action-src/main.ts
 */

import { getVariable, setResult, TaskResult } from "azure-pipelines-task-lib";
import { run as chromatic } from "chromatic/node";
import { postThread } from "./helpers.ts";

async function run() {
    try {
        const isVerbose = getVariable("CHROMATIC_VERBOSE");

        // This script accepts additional Chromatic CLI arguments.
        const argv: string[] = process.argv.slice(2);

        if (argv.includes("--only-changed")) {
            setResult(TaskResult.Failed, "--only-changed is added by default by @workleap/chromatic-ado.");

            return;
        }

        if (argv.includes("--auto-accept-changes")) {
            setResult(TaskResult.Failed, "--auto-accept-changes is already handled by @workleap/chromatic-ado.");

            return;
        }

        // Enable Turbosnap by default. For additional information about TurboSnap see: https://www.chromatic.com/docs/turbosnap/.
        if (!getVariable("CHROMATIC_DISABLE_TURBOSNAP")) {
            argv.push("--only-changed");
        }

        // Accepting the baseline automatically when Chromatic is executed on the "main" branch.
        // Running Chromatic on the "main" branch allow us to use "squash" merge for PRs, see: https://www.chromatic.com/docs/custom-ci-provider/#squashrebase-merge-and-the-main-branch.
        // Furthermore, changes from PR doesn't seem to be updating the baseline at all but I don't know why, it seems like a bug with ADO (but according to Chromatic customers support it's normal).
        const isAutoAcceptingChangesOnMainBranch = getVariable("Build.Reason") !== "PullRequest" && getVariable("Build.SourceBranch") === "refs/heads/main";

        if (isAutoAcceptingChangesOnMainBranch) {
            // The second arg restrict the changes to be auto accepted only for the "main" branch.
            argv.push("--auto-accept-changes", "main");
        }

        // Add default branch paths to ignore.
        if (!argv.includes("--skip")) {
            argv.push("--skip", "renovate/**", "changeset-release/**");
        }

        if (isVerbose) {
            console.log("[chromatic-ado] Running Chromatic with the following arguments: ", argv.join(", "));
        }

        const output = await chromatic({ argv });

        if (isVerbose) {
            console.log(`[chromatic-ado] Chromatic exited with the following output: ${JSON.stringify(output, null, 2)}.`);
        }

        // Usually happens when Chromatic skip the build because it detected that a build for the same commit has already been done.
        if (output.url === undefined && output.storybookUrl === undefined) {
            // For error codes view: https://www.chromatic.com/docs/cli/#exit-codes.
            if (output.code !== 0) {
                setResult(TaskResult.Failed, `Chromatic exited with code "${output.code}". For additional information abour Chromatic exit codes, view: https://www.chromatic.com/docs/cli/#exit-codes.`);
            } else {
                setResult(TaskResult.Skipped, "A build for the same commit as the last build on the branch is considered a rebuild. You can override this using the --force-rebuild flag.");
            }

            return;
        }

        // Chromatic will returns changes event if they are automatically accepted.
        // We don't want to go though the whole process in this case as it's happening on the main branch.
        if (isAutoAcceptingChangesOnMainBranch) {
            if (isVerbose) {
                const message = output.changeCount > 0
                    ? `${output.changeCount} visual ${output.changeCount === 1 ? "change" : "changes"} has been automatically accepted.`
                    : "";

                console.log(`[chromatic-ado] ${message}`);
            }

            return;
        }

        const comment = `
### ${output.errorCount > 0 || output.changeCount > 0 ? "❌" : "✅"} Chromatic

<div>
    <table>
    <tbody>
        <tr>
        <td>🔨 Latest commit:</td>
        <td>${getVariable("Build.SourceVersion")}</td>
        </tr>
        <tr>
        <td>💥 Errors:</td>
        <td>
${output.errorCount === 0
        ? "✅&nbsp; No test failed"
        : `❌&nbsp; ${output.errorCount} ${output.errorCount === 1 ? "test" : "tests"} failed`
}
        </td>
        </tr>
        <tr>
        <td>✨ Visual changes:</td>
        <td>
${output.changeCount === 0
        ? "✅&nbsp; None"
        : `❌&nbsp; Found ${output.changeCount} visual ${output.changeCount === 1 ? "change" : "changes"}`
}
        </tr>
        <tr>
        <td>🔍 Build URL:</td>
        <td>
        <a href="${output.buildUrl}" target="_blank" aria-label="${output.buildUrl} (Opens in a new window or tab)">${output.buildUrl}</a>
        <span class="fabric-icon ms-Icon--NavigateExternalInline font-size" role="presentation" aria-hidden="true"></span>
        </td>
        </tr>
        <tr>
        <td>🎨 Storybook URL:</td>
        <td>
        <a href="${output.storybookUrl}" target="_blank" arial-label="${output.storybookUrl} (Opens in a new window or tab)">${output.storybookUrl}</a>
        <span class="fabric-icon ms-Icon--NavigateExternalInline font-size" role="presentation" aria-hidden="true"></span>
        </td>
        </tr>
    </tbody>
    </table>
</div>
`;

        await postThread(comment, {
            id: "CHROMATIC_THREAD_ID",
            accessToken: getVariable("CHROMATIC_PULL_REQUEST_COMMENT_ACCESS_TOKEN")
        });

        if (output.errorCount > 0) {
            setResult(TaskResult.Failed, `${output.errorCount} ${output.errorCount === 1 ? "test" : "tests"} failed.`);
        }

        if (output.changeCount > 0) {
            setResult(
                TaskResult.Failed,
                `Found ${output.changeCount} visual ${output.changeCount === 1 ? "change" : "changes"}. Review the ${output.changeCount === 1 ? "change" : "changes"} and re-queue the build to proceed.`
            );
        }
    } catch (error) {
        if (error instanceof Error) {
            setResult(TaskResult.Failed, error.message);
        } else {
            setResult(TaskResult.Failed, `An unknown error occured: ${error}`);
        }
    }
}

run()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
