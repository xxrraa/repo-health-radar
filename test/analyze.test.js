import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { analyzeRepository } from "../src/analyze.js";
import { renderMarkdown } from "../src/report.js";

const NOW = new Date("2026-06-01T12:00:00.000Z");

test("scores a well-maintained repository highly", async () => {
  const root = await createTempRepository({
    "README.md": "# Demo\n\n## Install\n\n```bash\nnpm install\n```\n\n## Usage\n\nRun the CLI.\n",
    "LICENSE": "MIT",
    "CONTRIBUTING.md": "# Contributing\n\nRun npm test before opening a PR.\n",
    "CHANGELOG.md": "# Changelog\n\n## 0.1.0\n\nInitial release.\n",
    "SECURITY.md": "# Security\n\nReport vulnerabilities privately.\n",
    "CODE_OF_CONDUCT.md": "# Code of Conduct\n",
    "package.json": JSON.stringify({
      version: "0.1.0",
      scripts: {
        test: "node --test",
        lint: "node --check src/*.js",
        check: "npm run lint && npm test",
        audit: "npm audit"
      }
    }),
    "package-lock.json": "{}",
    ".nycrc": "{}",
    ".github/workflows/ci.yml": "name: CI\njobs:\n  test:\n    steps:\n      - run: npm test\n      - run: npm audit\n",
    ".github/workflows/release.yml": "name: Release\njobs:\n  release:\n    steps:\n      - run: gh release create v0.1.0\n",
    ".github/ISSUE_TEMPLATE/bug_report.yml": "name: Bug report\n",
    ".github/pull_request_template.md": "## Checklist\n- [ ] Tests pass\n",
    ".github/CODEOWNERS": "* @owner\n",
    ".github/FUNDING.yml": "github: owner\n",
    ".github/dependabot.yml": "version: 2\nupdates: []\n",
    "test/example.test.js": "import test from 'node:test';\n"
  });

  const result = await analyzeRepository(root, {
    now: NOW,
    gitStats: {
      available: true,
      commitsLast90Days: 12,
      latestCommitAt: "2026-05-31T12:00:00.000Z",
      tagsCount: 2
    },
    githubStats: {
      available: true,
      stars: 75,
      forks: 12,
      openIssues: 3
    }
  });

  assert.equal(result.grade, "A");
  assert.ok(result.score >= 90, `expected score >= 90, got ${result.score}`);
  assert.equal(result.recommendations.length, 0);
});

test("returns actionable recommendations for a sparse repository", async () => {
  const root = await createTempRepository({
    "package.json": JSON.stringify({
      version: "0.0.0",
      scripts: {}
    })
  });

  const result = await analyzeRepository(root, {
    now: NOW,
    gitStats: { available: false },
    githubStats: { available: false }
  });

  assert.ok(result.score < 30, `expected score < 30, got ${result.score}`);
  assert.ok(
    result.recommendations.some((item) => item.check === "README exists"),
    "expected README recommendation"
  );
});

test("renders a markdown report with categories and checks", async () => {
  const root = await createTempRepository({
    "README.md": "# Demo\n\n## Install\n\n## Usage\n",
    "LICENSE": "MIT"
  });

  const result = await analyzeRepository(root, {
    now: NOW,
    gitStats: { available: false },
    githubStats: { available: false }
  });
  const markdown = renderMarkdown(result);

  assert.match(markdown, /Repo Health Radar Report/);
  assert.match(markdown, /Docs and onboarding/);
  assert.match(markdown, /README exists/);
});

async function createTempRepository(files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repo-health-radar-"));

  await Promise.all(
    Object.entries(files).map(async ([relativePath, contents]) => {
      const absolutePath = path.join(root, relativePath);
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, contents);
    })
  );

  return root;
}
