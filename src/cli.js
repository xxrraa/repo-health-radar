#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { analyzeRepository } from "./analyze.js";
import { fetchGitHubStats, normalizeRepositorySlug } from "./github.js";
import { getGitStats } from "./git.js";
import { renderJson, renderMarkdown } from "./report.js";

const HELP = `
Repo Health Radar

Usage:
  repo-health-radar [options]

Options:
  --path <dir>              Repository path to scan. Defaults to current directory.
  --format <name>           markdown, json, or both. Defaults to markdown.
  --markdown-file <file>    Write the markdown report to a file.
  --json-file <file>        Write the JSON report to a file.
  --min-score <number>      Exit with code 1 when the score is below this value.
  --github-repo <owner/repo> Fetch public GitHub adoption metrics.
  --no-github               Disable GitHub API lookup.
  --help                    Show this help text.
  --version                 Show version.
`;

export async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);

  if (args.help) {
    process.stdout.write(HELP.trimStart());
    return 0;
  }

  if (args.version) {
    process.stdout.write("0.1.0\n");
    return 0;
  }

  const options = normalizeOptions(args, env);
  const root = path.resolve(options.path);
  const now = new Date();
  const gitStats = await getGitStats(root, now);
  const githubStats = options.noGithub
    ? { available: false, reason: "GitHub lookup disabled" }
    : await fetchGitHubStats(options.githubRepo, env.GITHUB_TOKEN);

  const result = await analyzeRepository(root, {
    now,
    gitStats,
    githubStats
  });

  const markdown = renderMarkdown(result);
  const json = renderJson(result);

  if (options.markdownFile) {
    await writeFileEnsuringDirectory(options.markdownFile, markdown);
  }

  if (options.jsonFile) {
    await writeFileEnsuringDirectory(options.jsonFile, json);
  }

  if (env.GITHUB_STEP_SUMMARY) {
    await fs.appendFile(env.GITHUB_STEP_SUMMARY, markdown);
  }

  if (env.GITHUB_OUTPUT) {
    await fs.appendFile(
      env.GITHUB_OUTPUT,
      [
        `score=${result.score}`,
        `grade=${result.grade}`,
        `passed=${String(options.minScore == null || result.score >= options.minScore)}`,
        `report-path=${options.markdownFile || ""}`
      ].join("\n") + "\n"
    );
  }

  if (options.format === "json") {
    process.stdout.write(json);
  } else if (options.format === "both") {
    process.stdout.write(markdown);
    process.stdout.write("\n");
    process.stdout.write(json);
  } else {
    process.stdout.write(markdown);
  }

  if (options.minScore != null && result.score < options.minScore) {
    process.stderr.write(
      `Repo Health Radar score ${result.score} is below required minimum ${options.minScore}.\n`
    );
    return 1;
  }

  return 0;
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--version") {
      args.version = true;
    } else if (arg === "--no-github") {
      args.noGithub = true;
    } else if (arg.startsWith("--")) {
      const key = toCamelCase(arg.slice(2));
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        throw new Error(`Missing value for ${arg}`);
      }
      args[key] = next;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

export function normalizeOptions(args, env) {
  const actionPath = getActionInput(env, "path");
  const actionFormat = getActionInput(env, "format");
  const actionMarkdownFile = getActionInput(env, "markdown-file");
  const actionJsonFile = getActionInput(env, "json-file");
  const actionMinScore = getActionInput(env, "min-score");
  const actionNoGithub = parseBoolean(getActionInput(env, "no-github"));
  const inputGitHubRepo = getActionInput(env, "github-repo");
  const autoGitHubRepo = env.GITHUB_REPOSITORY || undefined;
  const githubRepo = args.githubRepo || inputGitHubRepo || autoGitHubRepo;
  const normalizedRepo = normalizeRepositorySlug(githubRepo);

  const format = args.format || actionFormat || "markdown";
  if (!["markdown", "json", "both"].includes(format)) {
    throw new Error("--format must be markdown, json, or both");
  }

  const minScoreValue = args.minScore ?? actionMinScore;
  const minScore = minScoreValue == null || minScoreValue === ""
    ? null
    : Number(minScoreValue);

  if (minScore != null && (!Number.isFinite(minScore) || minScore < 0 || minScore > 100)) {
    throw new Error("--min-score must be a number between 0 and 100");
  }

  return {
    path: args.path || actionPath || ".",
    format,
    markdownFile: args.markdownFile || actionMarkdownFile || "",
    jsonFile: args.jsonFile || actionJsonFile || "",
    minScore,
    noGithub: Boolean(args.noGithub || actionNoGithub),
    githubRepo: normalizedRepo
  };
}

async function writeFileEnsuringDirectory(filePath, contents) {
  const absolute = path.resolve(filePath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, contents);
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function getActionInput(env, name) {
  const normalized = name.toUpperCase().replaceAll("-", "_");
  const hyphenated = name.toUpperCase();
  return env[`INPUT_${normalized}`] || env[`INPUT_${hyphenated}`] || undefined;
}

function parseBoolean(value) {
  if (value == null || value === "") return false;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
