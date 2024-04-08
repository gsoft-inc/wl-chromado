#!/usr/bin/env node

/**
 * This script is heavily inspired by the official Chromatic Github Action.
 * @see https://github.com/chromaui/chromatic-cli/blob/main/action-src/main.ts
 */

import { getVariable, setResult, TaskResult } from "azure-pipelines-task-lib";
import { run as runNode } from "chromatic/node";
import { postThread } from "./helpers.ts";

function isSkippedOrOutputIsInvalid(
    output: Awaited<ReturnType<typeof runNode>>
) {
    return output.url === undefined && output.storybookUrl === undefined;
}

async function run() {
    try {
        const commitHash = getVariable("Build.SourceVersion");

        // Accept additional CLI arguments.
        const output = await runNode({ argv: process.argv.slice(2) });

        if (isSkippedOrOutputIsInvalid(output)) {
            if (output.code !== 0) {
                setResult(
                    TaskResult.Failed,
                    `Chromatic exited with code '${output.code}'.`
                );
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
        <td><code>${commitHash}</code></td>
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
            setResult(
                TaskResult.Failed,
                `${output.errorCount} ${output.errorCount === 1 ? "test" : "tests"} failed.`
            );
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

            return;
        } else {
            setResult(TaskResult.Failed, `An unknown error occured: ${error}`);

            return;
        }
    }
}

run()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
