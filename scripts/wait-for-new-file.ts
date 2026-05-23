#!/usr/bin/env bun
import { existsSync, readdirSync, statSync, watch } from "node:fs";
import { resolve } from "node:path";

function usage() {
  console.error(`usage: bun run scripts/wait-for-new-file.ts <folder> [--timeout <seconds>] [--quiet]

Waits until a new directory entry appears in <folder>, then prints its absolute path.
Options:
  --timeout <seconds>  Exit 124 if no new file appears before the timeout
  --quiet              Do not print the detected file path
`);
}

const args = process.argv.slice(2);
const folderArg = args.shift();

if (!folderArg || args.includes("--help") || args.includes("-h")) {
  usage();
  process.exit(folderArg ? 0 : 2);
}

let timeoutSeconds: number | undefined;
let quiet = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--quiet") {
    quiet = true;
  } else if (arg === "--timeout") {
    const value = args[++i];
    if (!value || Number.isNaN(Number(value)) || Number(value) < 0) {
      console.error("error: --timeout requires a non-negative number of seconds");
      process.exit(2);
    }
    timeoutSeconds = Number(value);
  } else {
    console.error(`error: unknown argument ${arg}`);
    usage();
    process.exit(2);
  }
}

const folder = resolve(folderArg);

if (!existsSync(folder)) {
  console.error(`error: folder does not exist: ${folder}`);
  process.exit(2);
}

if (!statSync(folder).isDirectory()) {
  console.error(`error: not a folder: ${folder}`);
  process.exit(2);
}

const seen = new Set(readdirSync(folder));
let finished = false;
let watcher: ReturnType<typeof watch> | undefined;
let timeout: Timer | undefined;

function finish(name: string) {
  if (finished) return;
  finished = true;
  watcher?.close();
  if (timeout) clearTimeout(timeout);
  if (!quiet) console.log(resolve(folder, name));
  process.exit(0);
}

function check() {
  for (const name of readdirSync(folder)) {
    if (!seen.has(name)) finish(name);
  }
}

watcher = watch(folder, (_eventType, filename) => {
  if (filename && !seen.has(filename.toString())) finish(filename.toString());
  check();
});

if (timeoutSeconds !== undefined) {
  timeout = setTimeout(() => {
    finished = true;
    watcher?.close();
    console.error(`timed out waiting for a new file in ${folder}`);
    process.exit(124);
  }, timeoutSeconds * 1000);
}

check();
