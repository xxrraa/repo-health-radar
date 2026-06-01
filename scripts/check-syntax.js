#!/usr/bin/env node
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const DIRECTORIES = ["src", "test"];

async function main() {
  const files = [];

  for (const directory of DIRECTORIES) {
    files.push(...await findJavaScriptFiles(path.join(ROOT, directory)));
  }

  for (const file of files) {
    await execFileAsync(process.execPath, ["--check", file]);
  }
}

async function findJavaScriptFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...await findJavaScriptFiles(absolute));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(absolute);
    }
  }

  return files;
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
