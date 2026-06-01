export function normalizeRepositorySlug(value) {
  if (!value || value === "auto") return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^([\w.-]+)\/([\w.-]+)$/);
  return match ? `${match[1]}/${match[2]}` : null;
}

export async function fetchGitHubStats(repositorySlug, token) {
  const slug = normalizeRepositorySlug(repositorySlug);
  if (!slug) {
    return {
      available: false,
      reason: "No GitHub repository slug provided"
    };
  }

  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "repo-health-radar"
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${slug}`, {
      headers
    });

    if (!response.ok) {
      return {
        available: false,
        repository: slug,
        reason: `GitHub API returned ${response.status}`
      };
    }

    const data = await response.json();
    return {
      available: true,
      repository: slug,
      stars: data.stargazers_count ?? 0,
      forks: data.forks_count ?? 0,
      watchers: data.subscribers_count ?? data.watchers_count ?? 0,
      openIssues: data.open_issues_count ?? 0,
      defaultBranch: data.default_branch ?? null,
      pushedAt: data.pushed_at ?? null,
      archived: Boolean(data.archived),
      license: data.license?.spdx_id ?? null,
      topics: Array.isArray(data.topics) ? data.topics : []
    };
  } catch (error) {
    return {
      available: false,
      repository: slug,
      reason: error.message
    };
  }
}
