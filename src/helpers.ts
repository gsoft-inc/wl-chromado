import { getVariable } from "azure-pipelines-task-lib";

enum CommentType {
    Unknown = 0,
    Text = 1,
    CodeChange = 2,
    System = 3
}

interface Thread {
    id: number;
    isDeleted: boolean;
    properties?: Record<string, { $type: string; $value: string }>;
}

interface GetVariablesOptions {
    accessToken?: string;
}

function getVariables({ accessToken }: GetVariablesOptions = {}) {
    return {
        token: accessToken ?? getVariable("System.AccessToken"),
        collectionUri: getVariable("System.CollectionUri"),
        repositoryId: getVariable("Build.Repository.ID"),
        pullRequestId: getVariable("System.PullRequest.PullRequestId")
    };
}

interface GetThreadOptions {
    accessToken?: string;
}

async function getThreads({ accessToken }: GetThreadOptions = {}): Promise<Thread[]> {
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

interface CreateThreadOptions {
    id?: string;
    accessToken?: string;
}

async function createThread(content: string, { id, accessToken }: CreateThreadOptions = {}) {
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
                    commentType: CommentType.CodeChange,
                    content
                }
            ]
        })
    });

    if (!response.ok) {
        throw new Error(`Failed to create thread. Status: ${response.status}`);
    }
}

interface EditThreadOptions {
    accessToken?: string;
}

async function editThread(content: string, threadId: number, commentId: number, { accessToken }: EditThreadOptions = {}) {
    const { token, collectionUri, repositoryId, pullRequestId } = getVariables({ accessToken });

    const url = `${collectionUri}/_apis/git/repositories/${repositoryId}/pullRequests/${pullRequestId}/threads/${threadId}/comments/${commentId}?api-version=7.1-preview.1`;

    const response = await fetch(url, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Basic ${btoa(`:${token}`)}`
        },
        body: JSON.stringify({
            commentType: CommentType.CodeChange,
            content
        })
    });

    if (response.status !== 200) {
        throw new Error(`Failed to edit threads. Status: ${response.status}`);
    }
}

export interface PostThreadOptions {
    id?: string;
    accessToken?: string;
}

export async function postThread(content: string, { id, accessToken }: PostThreadOptions = {}) {
    const { pullRequestId } = getVariables();

    // Not running in a PR, so we don't need to post a comment.
    if (!pullRequestId) {
        return;
    }

    try {
        let match: Thread | undefined = undefined;

        if (id) {
            const threads = await getThreads({ accessToken });

            match = threads.find(thread => !thread.isDeleted && thread.properties?.id?.$value === id);
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
