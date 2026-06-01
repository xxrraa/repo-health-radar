# Repo Health Radar

Repo Health Radar is a zero-dependency CLI and GitHub Action that scores the health of an open-source repository. It checks the signals maintainers, contributors, grant reviewers, and users look for: docs, CI, tests, release hygiene, security posture, maintainer workflow, activity, and public adoption.

It is built for maintainers who want a fast, repeatable way to find the highest-impact cleanup work before publishing, applying to OSS programs, or inviting contributors.

## Install

Run locally from this repository:

```bash
node src/cli.js --path . --format markdown
```

After publishing to npm:

```bash
npx repo-health-radar --path . --format both
```

## Usage

Create a markdown and JSON report:

```bash
repo-health-radar \
  --path . \
  --format both \
  --markdown-file repo-health-radar.md \
  --json-file repo-health-radar.json
```

Fail when the score is below a threshold:

```bash
repo-health-radar --path . --min-score 75
```

Include GitHub adoption metrics:

```bash
GITHUB_TOKEN=ghp_example repo-health-radar --github-repo owner/repo
```

## GitHub Action

```yaml
name: Repo health

on:
  pull_request:
  push:
    branches: [main]

jobs:
  radar:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: xxrraa/repo-health-radar@v1
        with:
          min-score: "75"
          markdown-file: repo-health-radar.md
          json-file: repo-health-radar.json
```

The action writes a summary to the GitHub Actions job summary and exposes these outputs:

| Output | Description |
| --- | --- |
| `score` | Repository score from 0 to 100. |
| `grade` | Letter grade from A to F. |
| `passed` | Whether the score met `min-score`. |
| `report-path` | Markdown report path when configured. |

## Scoring

Repo Health Radar scores six categories:

| Category | Weight | Examples |
| --- | ---: | --- |
| Docs and onboarding | 20 | README, install/usage guidance, license, contributing guide, changelog. |
| Maintainer workflow | 18 | Issue templates, PR template, CODEOWNERS, funding metadata, Dependabot. |
| Release readiness | 14 | Version metadata, changelog, tags, release automation. |
| CI and testability | 20 | GitHub Actions, test command, test files, quality scripts, coverage signal. |
| Security and trust | 16 | SECURITY.md, lockfiles, dependency audit, code scanning. |
| Activity and adoption | 12 | Recent commits, freshness, stars, forks, visible issues. |

The score is intentionally practical. It highlights concrete fixes that improve contributor experience and make maintenance work easier to verify.

## Why Maintainers Use It

Use the report to:

- Prepare a repository before sharing it publicly.
- Prioritize cleanup work before requesting contributors.
- Show reviewers a clear record of active maintenance.
- Find missing files that make OSS projects easier to trust.
- Add a quality gate to pull requests.

## Local Development

```bash
npm install
npm test
npm run lint
npm run smoke
```

## Publishing Checklist

Before publishing this repository:

- Run `npm version patch`, `minor`, or `major`.
- Create a GitHub release and tag, for example `v0.1.0`.
- Publish to npm if you want `npx repo-health-radar` to work globally.
- Pin action usage to a release tag such as `xxrraa/repo-health-radar@v1`.

## License

MIT
