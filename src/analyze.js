import fs from "node:fs/promises";
import path from "node:path";
import { VERSION } from "./version.js";

const IGNORE_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
  "vendor"
]);

const POSIX_SEP = "/";

export async function analyzeRepository(rootDirectory, options = {}) {
  const root = path.resolve(rootDirectory);
  const now = options.now ? new Date(options.now) : new Date();
  const tree = await scanRepository(root);
  const packageJson = await readJsonIfPresent(path.join(root, "package.json"));
  const workflowContents = await readWorkflowContents(root, tree);

  const context = {
    root,
    tree,
    now,
    packageJson,
    workflowContents,
    gitStats: options.gitStats ?? { available: false },
    githubStats: options.githubStats ?? { available: false }
  };

  const categories = [
    buildDocsCategory(context),
    buildMaintenanceCategory(context),
    buildReleaseCategory(context),
    buildCiCategory(context),
    buildSecurityCategory(context),
    buildActivityCategory(context)
  ].map(scoreCategory);

  const score = Math.round(
    categories.reduce((total, category) => total + category.score, 0)
  );

  const recommendations = categories
    .flatMap((category) =>
      category.checks
        .filter((check) => check.points < check.maxPoints)
        .map((check) => ({
          category: category.title,
          check: check.title,
          impact: check.maxPoints - check.points,
          recommendation: check.recommendation
        }))
    )
    .sort((left, right) => right.impact - left.impact)
    .slice(0, 10);

  return {
    tool: "repo-health-radar",
    version: VERSION,
    generatedAt: now.toISOString(),
    root,
    score,
    grade: gradeForScore(score),
    categories,
    recommendations,
    metadata: {
      git: context.gitStats,
      github: context.githubStats
    }
  };
}

export async function scanRepository(root) {
  const files = [];

  async function visit(directory) {
    let entries = [];
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".github") {
        if (entry.isDirectory() && IGNORE_DIRECTORIES.has(entry.name)) continue;
      }

      const absolutePath = path.join(directory, entry.name);
      const relativePath = toPosix(path.relative(root, absolutePath));

      if (entry.isDirectory()) {
        if (IGNORE_DIRECTORIES.has(entry.name)) continue;
        await visit(absolutePath);
      } else if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  }

  await visit(root);

  const lowerToActual = new Map();
  for (const file of files) {
    lowerToActual.set(file.toLowerCase(), file);
  }

  return {
    files,
    lowerFiles: new Set(files.map((file) => file.toLowerCase())),
    lowerToActual
  };
}

function buildDocsCategory(context) {
  const readme = findAny(context.tree, ["README.md", "readme.md"]);
  const readmeText = readme ? context.workflowContents.extra?.get(readme) : "";
  const hasInstall = /\b(install|setup|quickstart|get started)\b/i.test(readmeText);
  const hasUsage = /\b(usage|example|cli|github action|workflow)\b/i.test(readmeText);

  return {
    id: "docs",
    title: "Docs and onboarding",
    weight: 20,
    checks: [
      check({
        id: "readme",
        title: "README exists",
        maxPoints: 5,
        points: readme ? 5 : 0,
        evidence: readme ?? "No README found",
        recommendation: "Add a README with a concise problem statement, install steps, and examples."
      }),
      check({
        id: "readme-quality",
        title: "README has install and usage guidance",
        maxPoints: 5,
        points: (hasInstall ? 2.5 : 0) + (hasUsage ? 2.5 : 0),
        evidence: readme
          ? `install=${String(hasInstall)}, usage=${String(hasUsage)}`
          : "README missing",
        recommendation: "Add install and usage sections so new users can succeed in under five minutes."
      }),
      check({
        id: "license",
        title: "License is present",
        maxPoints: 4,
        points: hasAny(context.tree, ["LICENSE", "LICENSE.md", "COPYING"]) ? 4 : 0,
        evidence: findAny(context.tree, ["LICENSE", "LICENSE.md", "COPYING"]) ?? "No license file found",
        recommendation: "Add a standard OSS license such as MIT, Apache-2.0, BSD-3-Clause, or GPL."
      }),
      check({
        id: "contributing",
        title: "Contributing guide is present",
        maxPoints: 3,
        points: hasAny(context.tree, ["CONTRIBUTING.md", ".github/CONTRIBUTING.md", "docs/CONTRIBUTING.md"]) ? 3 : 0,
        evidence: findAny(context.tree, ["CONTRIBUTING.md", ".github/CONTRIBUTING.md", "docs/CONTRIBUTING.md"]) ?? "No contributing guide found",
        recommendation: "Add CONTRIBUTING.md with setup, test, and PR expectations."
      }),
      check({
        id: "changelog",
        title: "Changelog is present",
        maxPoints: 3,
        points: hasAny(context.tree, ["CHANGELOG.md", "changes.md", "HISTORY.md"]) ? 3 : 0,
        evidence: findAny(context.tree, ["CHANGELOG.md", "changes.md", "HISTORY.md"]) ?? "No changelog found",
        recommendation: "Add CHANGELOG.md so users and reviewers can understand release progress."
      })
    ]
  };
}

function buildMaintenanceCategory(context) {
  return {
    id: "maintenance",
    title: "Maintainer workflow",
    weight: 18,
    checks: [
      check({
        id: "issue-templates",
        title: "Issue templates exist",
        maxPoints: 4,
        points: hasMatching(context.tree, (file) => file.startsWith(".github/issue_template/")) ? 4 : 0,
        evidence: listMatching(context.tree, (file) => file.startsWith(".github/issue_template/")).join(", ") || "No issue templates found",
        recommendation: "Add issue templates that request reproduction steps, environment details, and expected behavior."
      }),
      check({
        id: "pr-template",
        title: "Pull request template exists",
        maxPoints: 4,
        points: hasAny(context.tree, [".github/pull_request_template.md", "pull_request_template.md"]) ? 4 : 0,
        evidence: findAny(context.tree, [".github/pull_request_template.md", "pull_request_template.md"]) ?? "No PR template found",
        recommendation: "Add a PR template with test, docs, and release-note prompts."
      }),
      check({
        id: "codeowners",
        title: "CODEOWNERS is configured",
        maxPoints: 3,
        points: hasAny(context.tree, [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"]) ? 3 : 0,
        evidence: findAny(context.tree, [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"]) ?? "No CODEOWNERS found",
        recommendation: "Add CODEOWNERS to make review ownership explicit."
      }),
      check({
        id: "funding",
        title: "Funding metadata exists",
        maxPoints: 2,
        points: hasAny(context.tree, [".github/FUNDING.yml", ".github/funding.yml"]) ? 2 : 0,
        evidence: findAny(context.tree, [".github/FUNDING.yml", ".github/funding.yml"]) ?? "No FUNDING.yml found",
        recommendation: "Add .github/FUNDING.yml if the project accepts sponsorship."
      }),
      check({
        id: "dependabot",
        title: "Dependency update automation exists",
        maxPoints: 3,
        points: hasAny(context.tree, [".github/dependabot.yml", ".github/dependabot.yaml"]) ? 3 : 0,
        evidence: findAny(context.tree, [".github/dependabot.yml", ".github/dependabot.yaml"]) ?? "No Dependabot config found",
        recommendation: "Add Dependabot or equivalent automation to keep dependencies fresh."
      }),
      check({
        id: "community-health",
        title: "Community health files exist",
        maxPoints: 2,
        points: hasAny(context.tree, ["CODE_OF_CONDUCT.md", ".github/CODE_OF_CONDUCT.md", "SUPPORT.md", ".github/SUPPORT.md"]) ? 2 : 0,
        evidence: findAny(context.tree, ["CODE_OF_CONDUCT.md", ".github/CODE_OF_CONDUCT.md", "SUPPORT.md", ".github/SUPPORT.md"]) ?? "No community health files found",
        recommendation: "Add CODE_OF_CONDUCT.md or SUPPORT.md to clarify community norms and support channels."
      })
    ]
  };
}

function buildReleaseCategory(context) {
  const packageVersion = context.packageJson?.version;
  const hasReleaseWorkflow = context.workflowContents.all.some((content) =>
    /\b(release|semantic-release|changesets|npm publish|gh release)\b/i.test(content)
  );
  const gitTags = context.gitStats.available ? context.gitStats.tagsCount ?? 0 : 0;

  return {
    id: "release",
    title: "Release readiness",
    weight: 14,
    checks: [
      check({
        id: "version",
        title: "Version metadata exists",
        maxPoints: 4,
        points: packageVersion || hasAny(context.tree, ["pyproject.toml", "Cargo.toml", "go.mod", "VERSION"]) ? 4 : 0,
        evidence: packageVersion ? `package.json version ${packageVersion}` : "No obvious version metadata found",
        recommendation: "Add version metadata through package.json, pyproject.toml, Cargo.toml, go.mod, or a VERSION file."
      }),
      check({
        id: "changelog-release",
        title: "Changelog supports releases",
        maxPoints: 3,
        points: hasAny(context.tree, ["CHANGELOG.md", ".changeset/config.json"]) ? 3 : 0,
        evidence: findAny(context.tree, ["CHANGELOG.md", ".changeset/config.json"]) ?? "No release changelog found",
        recommendation: "Keep a changelog or Changesets setup so releases are auditable."
      }),
      check({
        id: "git-tags",
        title: "Git tags are present",
        maxPoints: 3,
        points: gitTags > 0 ? 3 : 0,
        evidence: context.gitStats.available ? `${gitTags} git tag(s)` : "Git metadata unavailable",
        recommendation: "Create version tags for published releases."
      }),
      check({
        id: "release-automation",
        title: "Release automation is present",
        maxPoints: 4,
        points: hasReleaseWorkflow ? 4 : 0,
        evidence: hasReleaseWorkflow ? "Release terms found in workflow files" : "No release automation found",
        recommendation: "Add a release workflow or documented publish script."
      })
    ]
  };
}

function buildCiCategory(context) {
  const scripts = context.packageJson?.scripts ?? {};
  const scriptNames = Object.keys(scripts);
  const hasTestScript = scriptNames.includes("test");
  const hasLintScript = scriptNames.some((script) => /^(lint|format|typecheck|check)$/.test(script));
  const workflowFiles = listMatching(context.tree, (file) =>
    /^\.github\/workflows\/.+\.ya?ml$/.test(file)
  );

  return {
    id: "ci",
    title: "CI and testability",
    weight: 20,
    checks: [
      check({
        id: "ci-workflow",
        title: "CI workflow exists",
        maxPoints: 5,
        points: workflowFiles.length > 0 ? 5 : 0,
        evidence: workflowFiles.join(", ") || "No GitHub Actions workflow found",
        recommendation: "Add a CI workflow that runs tests on pull requests."
      }),
      check({
        id: "test-script",
        title: "Test command exists",
        maxPoints: 5,
        points: hasTestScript ? 5 : 0,
        evidence: hasTestScript ? `npm test: ${scripts.test}` : "No test script found in package.json",
        recommendation: "Add a single test command that contributors and CI can run."
      }),
      check({
        id: "test-files",
        title: "Test files exist",
        maxPoints: 4,
        points: hasTestFiles(context.tree) ? 4 : 0,
        evidence: listMatching(context.tree, isTestFile).slice(0, 5).join(", ") || "No test files found",
        recommendation: "Add focused tests for the project core behavior."
      }),
      check({
        id: "quality-scripts",
        title: "Quality scripts exist",
        maxPoints: 3,
        points: hasLintScript ? 3 : 0,
        evidence: hasLintScript ? scriptNames.filter((script) => /^(lint|format|typecheck|check)$/.test(script)).join(", ") : "No lint, format, typecheck, or check script found",
        recommendation: "Add lint, format, typecheck, or check scripts to catch regressions before review."
      }),
      check({
        id: "coverage",
        title: "Coverage signal exists",
        maxPoints: 3,
        points: hasAny(context.tree, [".nycrc", "codecov.yml", ".github/codecov.yml", "vitest.config.js", "vitest.config.ts", "jest.config.js"]) ? 3 : 0,
        evidence: findAny(context.tree, [".nycrc", "codecov.yml", ".github/codecov.yml", "vitest.config.js", "vitest.config.ts", "jest.config.js"]) ?? "No coverage config found",
        recommendation: "Add coverage reporting or an explicit coverage threshold when project maturity warrants it."
      })
    ]
  };
}

function buildSecurityCategory(context) {
  const scripts = context.packageJson?.scripts ?? {};
  const hasAuditScript = Object.keys(scripts).some((name) => /\baudit\b/i.test(name));
  const hasSecurityWorkflow = context.workflowContents.all.some((content) =>
    /\b(codeql|semgrep|gitleaks|trivy|snyk|npm audit|pnpm audit)\b/i.test(content)
  );

  return {
    id: "security",
    title: "Security and trust",
    weight: 16,
    checks: [
      check({
        id: "security-policy",
        title: "Security policy exists",
        maxPoints: 5,
        points: hasAny(context.tree, ["SECURITY.md", ".github/SECURITY.md", "docs/SECURITY.md"]) ? 5 : 0,
        evidence: findAny(context.tree, ["SECURITY.md", ".github/SECURITY.md", "docs/SECURITY.md"]) ?? "No SECURITY.md found",
        recommendation: "Add SECURITY.md with vulnerability reporting expectations."
      }),
      check({
        id: "dependency-updates-security",
        title: "Dependency updates are automated",
        maxPoints: 3,
        points: hasAny(context.tree, [".github/dependabot.yml", ".github/dependabot.yaml"]) ? 3 : 0,
        evidence: findAny(context.tree, [".github/dependabot.yml", ".github/dependabot.yaml"]) ?? "No Dependabot config found",
        recommendation: "Enable dependency update automation for security patches."
      }),
      check({
        id: "lockfile",
        title: "Lockfile or checksum file exists",
        maxPoints: 2,
        points: hasMatching(context.tree, isLockfile) ? 2 : 0,
        evidence: listMatching(context.tree, isLockfile).slice(0, 5).join(", ") || "No lockfile found",
        recommendation: "Commit lockfiles or checksum files where appropriate for reproducible installs."
      }),
      check({
        id: "audit",
        title: "Dependency audit signal exists",
        maxPoints: 3,
        points: hasAuditScript || hasSecurityWorkflow ? 3 : 0,
        evidence: hasAuditScript ? "Audit script found" : hasSecurityWorkflow ? "Security workflow found" : "No audit script or security workflow found",
        recommendation: "Add a security scan or dependency audit workflow."
      }),
      check({
        id: "code-scanning",
        title: "Code scanning signal exists",
        maxPoints: 3,
        points: hasSecurityWorkflow ? 3 : 0,
        evidence: hasSecurityWorkflow ? "Security scanner terms found in workflow files" : "No code scanning workflow found",
        recommendation: "Add CodeQL, Semgrep, or another code scanning workflow for higher-trust projects."
      })
    ]
  };
}

function buildActivityCategory(context) {
  const git = context.gitStats;
  const github = context.githubStats;
  const recentCommits = git.available ? git.commitsLast90Days ?? 0 : 0;
  const latestCommitAt = git.latestCommitAt ? new Date(git.latestCommitAt) : null;
  const daysSinceCommit = latestCommitAt
    ? Math.floor((context.now.getTime() - latestCommitAt.getTime()) / 86400000)
    : null;
  const stars = github.available ? github.stars ?? 0 : null;
  const forks = github.available ? github.forks ?? 0 : null;
  const openIssues = github.available ? github.openIssues ?? 0 : null;

  return {
    id: "activity",
    title: "Activity and adoption",
    weight: 12,
    checks: [
      check({
        id: "recent-commits",
        title: "Recent commit activity exists",
        maxPoints: 4,
        points: recentCommits >= 5 ? 4 : recentCommits > 0 ? 2 : 0,
        evidence: git.available ? `${recentCommits} commit(s) in the last 90 days` : "Git history unavailable",
        recommendation: "Keep a visible cadence of commits, issue triage, or releases."
      }),
      check({
        id: "freshness",
        title: "Latest commit is fresh",
        maxPoints: 3,
        points: daysSinceCommit == null ? 0 : daysSinceCommit <= 30 ? 3 : daysSinceCommit <= 90 ? 1.5 : 0,
        evidence: daysSinceCommit == null ? "Latest commit unavailable" : `${daysSinceCommit} day(s) since latest commit`,
        recommendation: "Land a small maintenance update if the repository has gone quiet."
      }),
      check({
        id: "stars",
        title: "GitHub stars show adoption",
        maxPoints: 2,
        points: stars == null ? 0 : stars >= 50 ? 2 : stars >= 5 ? 1 : 0,
        evidence: stars == null ? "GitHub metrics unavailable" : `${stars} star(s)`,
        recommendation: "Add examples, docs, and announcements that make adoption easy to verify."
      }),
      check({
        id: "forks",
        title: "GitHub forks show reuse",
        maxPoints: 1.5,
        points: forks == null ? 0 : forks >= 10 ? 1.5 : forks >= 2 ? 0.75 : 0,
        evidence: forks == null ? "GitHub metrics unavailable" : `${forks} fork(s)`,
        recommendation: "Make the project easy to fork and extend with clear architecture notes."
      }),
      check({
        id: "open-issues",
        title: "Issue queue is visible",
        maxPoints: 1.5,
        points: openIssues == null ? 0 : 1.5,
        evidence: openIssues == null ? "GitHub issue metrics unavailable" : `${openIssues} open issue(s)`,
        recommendation: "Use GitHub issues publicly so maintenance work is visible."
      })
    ]
  };
}

function scoreCategory(category) {
  const earned = category.checks.reduce((total, item) => total + item.points, 0);
  const possible = category.checks.reduce((total, item) => total + item.maxPoints, 0);
  const score = possible === 0 ? 0 : roundTo((earned / possible) * category.weight, 1);

  return {
    ...category,
    score,
    possible: category.weight,
    earned: roundTo(earned, 1),
    rawPossible: possible
  };
}

function check(input) {
  const points = Math.max(0, Math.min(input.maxPoints, Number(input.points) || 0));
  return {
    id: input.id,
    title: input.title,
    status: points >= input.maxPoints ? "pass" : points > 0 ? "warn" : "fail",
    points: roundTo(points, 1),
    maxPoints: input.maxPoints,
    evidence: input.evidence,
    recommendation: input.recommendation
  };
}

function hasAny(tree, candidates) {
  return Boolean(findAny(tree, candidates));
}

function findAny(tree, candidates) {
  for (const candidate of candidates) {
    const actual = tree.lowerToActual.get(toPosix(candidate).toLowerCase());
    if (actual) return actual;
  }
  return null;
}

function hasMatching(tree, predicate) {
  return tree.files.some((file) => predicate(file.toLowerCase()));
}

function listMatching(tree, predicate) {
  return tree.files.filter((file) => predicate(file.toLowerCase()));
}

function isTestFile(file) {
  return (
    file.startsWith("test/") ||
    file.startsWith("tests/") ||
    file.includes("/__tests__/") ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(file)
  );
}

function hasTestFiles(tree) {
  return hasMatching(tree, isTestFile);
}

function isLockfile(file) {
  return [
    "package-lock.json",
    "npm-shrinkwrap.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lockb",
    "poetry.lock",
    "pipfile.lock",
    "cargo.lock",
    "go.sum",
    "gemfile.lock",
    "composer.lock"
  ].includes(file);
}

async function readWorkflowContents(root, tree) {
  const workflowFiles = tree.files.filter((file) =>
    /^\.github\/workflows\/.+\.ya?ml$/i.test(file)
  );
  const all = [];
  const extra = new Map();

  for (const file of workflowFiles) {
    const text = await readTextIfPresent(path.join(root, file));
    all.push(text);
  }

  const readme = findAny(tree, ["README.md", "readme.md"]);
  if (readme) {
    extra.set(readme, await readTextIfPresent(path.join(root, readme)));
  }

  return { all, extra };
}

async function readTextIfPresent(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function toPosix(value) {
  return value.split(path.sep).join(POSIX_SEP);
}

function roundTo(value, decimals) {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}

function gradeForScore(score) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}
