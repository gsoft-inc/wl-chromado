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
        const isDebug = getVariable("CHROMATIC_DEBUG");

        // This script accepts additional Chromatic CLI arguments.
        const argv: string[] = process.argv.slice(2);

        if (argv.includes("--only-changed")) {
            setResult(TaskResult.Failed, "--only-changed is added by default by @workleap/chromado.");

            return;
        }

        if (argv.includes("--auto-accept-changes")) {
            setResult(TaskResult.Failed, "--auto-accept-changes is already handled by @workleap/chromado.");

            return;
        }

        if (argv.includes("--debug")) {
            setResult(TaskResult.Failed, "--debug is bot supported by @workleap/chromado. Provide a \"CHROMATIC_DEBUG\" environment variable instead.");

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

        if (isDebug) {
            argv.push("--debug");
        }

        if (isDebug) {
            console.log("[chromado] Running Chromatic with the following arguments: ", argv.join(", "));
        }

        const output = await chromatic({ argv });

        if (isDebug) {
            console.log(`[chromado] Chromatic exited with the following output: ${JSON.stringify(output, null, 2)}.`);
        }

        // 0 = OK
        // 1 = There are visual changes
        // 2 = There are components errors
        // For additional information about Chromatic exit codes, view: https://www.chromatic.com/docs/cli/#exit-codes.
        if (output.code !== 0 && output.code !== 1 && output.code !== 2) {
            setResult(TaskResult.Failed, `Chromatic exited with code "${output.code}". For additional information about Chromatic exit codes, view: https://www.chromatic.com/docs/cli/#exit-codes.`);

            return;
        }

        // Usually happens when Chromatic skip the build because it detected that a build for the same commit has already been done.
        if (output.url === undefined && output.storybookUrl === undefined) {
            setResult(TaskResult.Succeeded, "A build for the same commit as the last build on the branch is considered a rebuild. You can override this using the --force-rebuild flag.");

            return;
        }

        const changeCount = output.changeCount ?? 0;
        const errorCount = output.errorCount ?? 0;

        // Chromatic will returns changes even if they are automatically accepted.
        // We don't want to go though the whole process in this case as it's happening on the main branch.
        if (isAutoAcceptingChangesOnMainBranch) {
            if (isDebug) {
                const message = changeCount > 0
                    ? `${changeCount} visual ${changeCount === 1 ? "change" : "changes"} has been automatically accepted.`
                    : "";

                console.log(`[chromado] ${message}`);
            }

            return;
        }

        const comment = `
### ${errorCount > 0 || changeCount > 0 ? "❌" : "✅"} Chromatic

<div>
    <table>
    <tbody>
        <tr>
        <td>🔨 Latest commit:</td>
        <td>${getVariable("Build.SourceVersion")}</td>
        </tr>
        <tr>
        <td>💥 Component errors:</td>
        <td>
${errorCount === 0
        ? "✅&nbsp; None"
        : `❌&nbsp; ${errorCount} ${errorCount === 1 ? "error" : "errors"}`
}
        </td>
        </tr>
        <tr>
        <td>✨ Visual changes:</td>
        <td>
${changeCount === 0
        ? "✅&nbsp; None"
        : `❌&nbsp; Found ${changeCount} visual ${changeCount === 1 ? "change" : "changes"}`
}
        </tr>
        <tr>
        <td>🕵️‍♀️ Snapshots:</td>
        <td>
${output.inheritedCaptureCount !== 0
        ? `✅&nbsp; Captured ${output.actualCaptureCount} snapshots and inherited from ${output.inheritedCaptureCount} TurboSnaps`
        : "❌&nbsp; This build is not using TurboSnaps. Be sure to read Workleap's <a href=\"https://gsoft-inc.github.io/wl-chromado/best-practices/\" target=\"blank\" aria-label=\"https://gsoft-inc.github.io/wl-chromado/best-practices/ (Opens in a new window or tab)\">best practices<a/> for Chromatic."
}
        </td>
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

        if (errorCount > 0) {
            setResult(TaskResult.Failed, `${errorCount} ${errorCount === 1 ? "test" : "tests"} failed.`);
        }

        if (changeCount > 0) {
            const message = `Found ${changeCount} visual ${changeCount === 1 ? "change" : "changes"}. Review the ${changeCount === 1 ? "change" : "changes"} and re-queue the build to proceed.`;

            setResult(TaskResult.Failed, message);
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
