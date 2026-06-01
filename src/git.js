import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function getGitStats(root, now = new Date()) {
  const inside = await runGit(root, ["rev-parse", "--is-inside-work-tree"]);
  if (!inside.ok || inside.stdout.trim() !== "true") {
    return {
      available: false,
      reason: "Not inside a git worktree"
    };
  }

  const since = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const recentCommits = await runGit(root, ["log", `--since=${since}`, "--format=%H"]);
  const latestCommit = await runGit(root, ["log", "-1", "--format=%cI"]);
  const tags = await runGit(root, ["tag", "--list"]);
  const remotes = await runGit(root, ["remote", "-v"]);

  return {
    available: true,
    commitsLast90Days: recentCommits.ok ? countLines(recentCommits.stdout) : 0,
    latestCommitAt: latestCommit.ok ? latestCommit.stdout.trim() || null : null,
    tagsCount: tags.ok ? countLines(tags.stdout) : 0,
    remotes: remotes.ok ? uniqueRemoteNames(remotes.stdout) : []
  };
}

async function runGit(root, args) {
  try {
    const result = await execFileAsync("git", ["-C", root, ...args], {
      timeout: 5000,
      maxBuffer: 1024 * 1024
    });
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? error.message
    };
  }
}

function countLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean).length;
}

function uniqueRemoteNames(text) {
  return [...new Set(
    text
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/)[0])
      .filter(Boolean)
  )];
}
