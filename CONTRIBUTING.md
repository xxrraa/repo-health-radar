# Contributing

Thanks for improving Repo Health Radar. Keep changes small, tested, and easy to review.

## Setup

```bash
npm install
npm test
```

## Pull Requests

Before opening a PR:

- Run `npm run lint`.
- Run `npm test`.
- Run `npm run smoke`.
- Update README or CHANGELOG when behavior changes.

## Design Principles

- Prefer zero runtime dependencies.
- Keep checks explainable and actionable.
- Avoid network calls unless the user explicitly provides a GitHub repository or the action environment supplies one.
- Make reports useful both locally and in CI.
