import assert from "node:assert/strict";
import test from "node:test";
import { normalizeOptions } from "../src/cli.js";

test("normalizes GitHub Action inputs with underscore environment names", () => {
  const options = normalizeOptions({}, {
    INPUT_MIN_SCORE: "82",
    INPUT_MARKDOWN_FILE: "radar.md",
    INPUT_JSON_FILE: "radar.json",
    INPUT_GITHUB_REPO: "owner/repo"
  });

  assert.equal(options.minScore, 82);
  assert.equal(options.markdownFile, "radar.md");
  assert.equal(options.jsonFile, "radar.json");
  assert.equal(options.githubRepo, "owner/repo");
});

test("normalizes GitHub Action inputs with hyphenated environment names", () => {
  const options = normalizeOptions({}, {
    "INPUT_MIN-SCORE": "90",
    "INPUT_NO-GITHUB": "true",
    "INPUT_GITHUB-REPO": "owner/repo"
  });

  assert.equal(options.minScore, 90);
  assert.equal(options.noGithub, true);
  assert.equal(options.githubRepo, "owner/repo");
});
