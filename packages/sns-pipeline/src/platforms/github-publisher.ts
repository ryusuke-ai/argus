const API_BASE = "https://api.github.com";

function getCredentials() {
  const token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  if (!token) {
    return null;
  }
  return { token };
}

function buildHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

export async function publishToGitHub(input: {
  name: string;
  description: string;
  readme: string;
  topics: string[];
  visibility: "public" | "private";
}): Promise<{
  success: boolean;
  url?: string;
  fullName?: string;
  error?: string;
}> {
  const creds = getCredentials();
  if (!creds) {
    return { success: false, error: "GitHub API credentials not configured" };
  }

  const headers = buildHeaders(creds.token);

  try {
    // Step 1: Create repository
    const repoResponse = await fetch(`${API_BASE}/user/repos`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: input.name,
        description: input.description,
        private: input.visibility === "private",
        auto_init: false,
      }),
    });

    if (!repoResponse.ok) {
      const errorBody = await repoResponse.json().catch(() => ({}));
      return {
        success: false,
        error: `GitHub API error ${repoResponse.status}: ${JSON.stringify(errorBody)}`,
      };
    }

    const repoData = (await repoResponse.json()) as {
      full_name?: string;
      html_url?: string;
    };
    const fullName = repoData.full_name!;
    const url = repoData.html_url!;

    // Step 2: Create README.md
    const readmeResponse = await fetch(
      `${API_BASE}/repos/${fullName}/contents/README.md`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({
          message: "Initial commit: add README",
          content: Buffer.from(input.readme).toString("base64"),
        }),
      },
    );

    if (!readmeResponse.ok) {
      const errorBody = await readmeResponse.json().catch(() => ({}));
      return {
        success: false,
        error: `GitHub API error creating README ${readmeResponse.status}: ${JSON.stringify(errorBody)}`,
      };
    }

    // Step 3: Set topics (skip if empty)
    if (input.topics.length > 0) {
      const topicsResponse = await fetch(
        `${API_BASE}/repos/${fullName}/topics`,
        {
          method: "PUT",
          headers,
          body: JSON.stringify({ names: input.topics }),
        },
      );

      if (!topicsResponse.ok) {
        const errorBody = await topicsResponse.json().catch(() => ({}));
        return {
          success: false,
          error: `GitHub API error setting topics ${topicsResponse.status}: ${JSON.stringify(errorBody)}`,
        };
      }
    }

    return { success: true, url, fullName };
  } catch (error) {
    return { success: false, error: `Network error: ${error}` };
  }
}
