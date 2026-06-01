import assert from "node:assert/strict";
import test from "node:test";
import { fetchGitHubStats } from "../src/github.js";

test("counts open GitHub issues without pull requests", async (t) => {
  const originalFetch = globalThis.fetch;
  const requests = [];

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    requests.push(url);

    if (url.endsWith("/repos/owner/repo")) {
      return jsonResponse({
        stargazers_count: 5,
        forks_count: 2,
        subscribers_count: 1,
        open_issues_count: 3,
        default_branch: "main",
        pushed_at: "2026-06-01T12:00:00.000Z",
        archived: false,
        license: { spdx_id: "MIT" },
        topics: ["oss"]
      });
    }

    if (url.endsWith("/repos/owner/repo/issues?state=open&per_page=100")) {
      return jsonResponse([
        { number: 1, title: "Bug" },
        { number: 2, title: "Feature" },
        { number: 3, title: "Fix", pull_request: {} }
      ]);
    }

    throw new Error(`Unexpected URL: ${url}`);
  };

  const stats = await fetchGitHubStats("owner/repo");

  assert.equal(stats.openIssues, 2);
  assert.deepEqual(requests, [
    "https://api.github.com/repos/owner/repo",
    "https://api.github.com/repos/owner/repo/issues?state=open&per_page=100"
  ]);
});

test("falls back to repository issue count when issue lookup fails", async (t) => {
  const originalFetch = globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (url) => {
    if (url.endsWith("/repos/owner/repo")) {
      return jsonResponse({ open_issues_count: 7 });
    }

    return {
      ok: false,
      status: 500,
      json: async () => ({})
    };
  };

  const stats = await fetchGitHubStats("owner/repo");

  assert.equal(stats.openIssues, 7);
});

function jsonResponse(data) {
  return {
    ok: true,
    status: 200,
    json: async () => data
  };
}
