#!/usr/bin/env node

/**
 * This script is heavily inspired by the official Chromatic Github Action.
 * @see https://github.com/chromaui/chromatic-cli/blob/main/action-src/main.ts
 */

import { getVariable, setResult, TaskResult } from "azure-pipelines-task-lib";
import { run as chromatic } from "chromatic/node";
import { postThread } from "./helpers.ts";

function isSkippedOrOutputIsInvalid(output: Awaited<ReturnType<typeof chromatic>>) {
    return output.url === undefined && output.storybookUrl === undefined;
}

async function run() {
    try {
        // Accept additional CLI arguments.
        const argv: string[] = process.argv.slice(2);

        console.log("*****************************: ", argv, JSON.stringify(argv));

        // TEMP
        argv.push("--only-changed");

        // Accepting the baseline automatically when Chromatic is executed on the "main" branch.
        // Running Chromatic on the "main" branch allow us to use "squash" merge for PRs, see: https://www.chromatic.com/docs/custom-ci-provider/#squashrebase-merge-and-the-main-branch.
        // Furthermore, changes from PR doesn't seem to be updating the baseline at all but I don't know why, it seems like a bug with ADO.
        if (getVariable("Build.Reason") !== "PullRequest" && getVariable("Build.SourceBranch") === "refs/heads/main") {
            argv.push("--auto-accept-changes main");
        }

        const output = await chromatic({ argv });

        if (isSkippedOrOutputIsInvalid(output)) {
            if (output.code !== 0) {
                setResult(TaskResult.Failed, `Chromatic exited with code "${output.code}".`);
            }

            return;
        }

        const comment = `
## 🎨 Chromatic

<div>
    <table>
    <tbody>
        <tr>
        <td><b>Latest commit:</b></td>
        <td><code>${getVariable("Build.SourceVersion")}</code></td>
        </tr>
        <tr>
        <td><b>Errors:</b></td>
        <td>
${output.errorCount === 0
        ? "✅&nbsp; None"
        : `❌&nbsp; ${output.errorCount} ${
            output.errorCount === 1 ? "test" : "tests"
        } failed`
}
        </td>
        </tr>
        <tr>
        <td><b>Visual changes:</b></td>
        <td>
${output.changeCount === 0
        ? "✅&nbsp; None"
        : `⚠️&nbsp; Found ${output.changeCount} visual ${
            output.changeCount === 1 ? "change" : "changes"
        }`
}
        </tr>
        <tr>
        <td><b>Build URL:</b></td>
        <td><a href="${output.buildUrl}" target="_blank">${output.buildUrl}</a></td>
        </tr>
        <tr>
        <td><b>Storybook URL:</b></td>
        <td><a href="${output.storybookUrl}" target="_blank">${output.storybookUrl}</a></td>
        </tr>
    </tbody>
    </table>
</div>
`;

        await postThread(comment, {
            id: "CHROMATIC_THREAD_ID",
            accessToken: getVariable("PULL_REQUEST_COMMENT_ACCESS_TOKEN")
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
