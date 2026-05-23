import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

type Config = {
  audio: string;
  workDir?: string;
  output?: string;
  comfy?: {
    path?: string;
    baseUrl?: string;
    launch?: boolean;
    startupTimeoutSeconds?: number;
  };
};

type JobStatus = "queued" | "running" | "succeeded" | "failed";

type Job = {
  id: number;
  command: string;
  args: string[];
  status: JobStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number | null;
  stdout: string;
  stderr: string;
};

const defaultConfigPath = "./music-video.config.json";
const configPath = Bun.env.MUSIC_VIDEO_CONFIG ?? defaultConfigPath;
const port = Number(Bun.env.MUSIC_VIDEO_SERVER_PORT ?? "3030");
const jobs = new Map<number, Job>();
let nextJobId = 1;
let queue = Promise.resolve();
let comfyProcess: ReturnType<typeof spawn> | undefined;

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function loadConfig() {
  if (!existsSync(configPath)) throw new Error(`missing config: ${configPath}`);
  return readJson<Config>(configPath);
}

function paths(config: Config) {
  const workDir = resolve(config.workDir ?? "./work/default");
  return {
    workDir,
    planPath: join(workDir, "plan.json"),
    output: resolve(config.output ?? "./output/music-video.mp4"),
  };
}

function json(value: unknown, status = 200) {
  return Response.json(value, { status });
}

async function body(request: Request) {
  if (request.method === "GET" || request.method === "HEAD") return {} as Record<string, unknown>;
  const text = await request.text();
  if (!text.trim()) return {} as Record<string, unknown>;
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSON body must be an object");
  return parsed as Record<string, unknown>;
}

function numberParam(input: Record<string, unknown>, name: string, required = true) {
  const value = input[name];
  if (value === undefined || value === null || value === "") {
    if (required) throw new Error(`${name} is required`);
    return undefined;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${name} must be a number`);
  return number;
}

function stringParam(input: Record<string, unknown>, name: string) {
  const value = input[name];
  return typeof value === "string" ? value : undefined;
}

async function urlOk(url: string) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureComfy() {
  const config = loadConfig();
  const baseUrl = config.comfy?.baseUrl ?? "http://127.0.0.1:8188";
  if (await urlOk(`${baseUrl}/system_stats`)) return { baseUrl, started: false };
  if (!config.comfy?.launch) throw new Error(`ComfyUI is not reachable at ${baseUrl}`);
  if (!config.comfy.path) throw new Error("config.comfy.path is required when comfy.launch is true");

  const comfyPath = resolve(config.comfy.path);
  const python = existsSync(join(comfyPath, ".venv/bin/python")) ? join(comfyPath, ".venv/bin/python") : "python3";
  comfyProcess = spawn(python, ["main.py", "--disable-auto-launch"], {
    cwd: comfyPath,
    stdio: "inherit",
    detached: false,
  });

  const deadline = Date.now() + (config.comfy.startupTimeoutSeconds ?? 180) * 1000;
  while (Date.now() < deadline) {
    if (await urlOk(`${baseUrl}/system_stats`)) return { baseUrl, started: true };
    await Bun.sleep(1000);
  }
  throw new Error(`timed out waiting for ComfyUI at ${baseUrl}`);
}

function enqueue(command: string, cliArgs: string[]) {
  const job: Job = {
    id: nextJobId++,
    command,
    args: cliArgs,
    status: "queued",
    createdAt: new Date().toISOString(),
    stdout: "",
    stderr: "",
  };
  jobs.set(job.id, job);

  queue = queue.then(async () => {
    job.status = "running";
    job.startedAt = new Date().toISOString();
    if (["image", "clip"].includes(command)) await ensureComfy();

    await new Promise<void>((resolvePromise) => {
      const child = spawn("bun", ["run", "src/cli.ts", command, "--config", configPath, ...cliArgs], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout.on("data", (chunk) => {
        job.stdout += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        job.stderr += String(chunk);
      });
      child.on("close", (code) => {
        job.exitCode = code;
        job.status = code === 0 ? "succeeded" : "failed";
        job.finishedAt = new Date().toISOString();
        resolvePromise();
      });
    });
  }).catch((error) => {
    job.status = "failed";
    job.stderr += `\n${error instanceof Error ? error.stack ?? error.message : String(error)}\n`;
    job.finishedAt = new Date().toISOString();
  });

  return job;
}

function planSummary() {
  const config = loadConfig();
  const { planPath, output } = paths(config);
  if (!existsSync(planPath)) return { exists: false, planPath, output };
  const plan = readJson<{ scenes?: { image?: string; approvedImageAttempt?: number; clip?: string; approvedAttempt?: number }[] }>(planPath);
  const scenes = plan.scenes ?? [];
  return {
    exists: true,
    planPath,
    output,
    scenes: scenes.length,
    approvedImages: scenes.filter((scene) => scene.image || scene.approvedImageAttempt).length,
    approvedClips: scenes.filter((scene) => scene.clip && scene.approvedAttempt).length,
  };
}

function cliArgsFrom(input: Record<string, unknown>, names: string[]) {
  const args: string[] = [];
  for (const name of names) {
    const value = input[name];
    if (value === undefined || value === null || value === false) continue;
    args.push(`--${name}`);
    if (value !== true) args.push(String(value));
  }
  return args;
}

async function route(request: Request) {
  const url = new URL(request.url);
  try {
    if (request.method === "GET" && url.pathname === "/status") {
      const config = loadConfig();
      const baseUrl = config.comfy?.baseUrl ?? "http://127.0.0.1:8188";
      return json({ comfy: { baseUrl, reachable: await urlOk(`${baseUrl}/system_stats`) }, plan: planSummary(), jobs: [...jobs.values()].slice(-20) });
    }

    if (request.method === "GET" && url.pathname.startsWith("/jobs/")) {
      const id = Number(url.pathname.split("/").at(-1));
      const job = jobs.get(id);
      return job ? json(job) : json({ error: "job not found" }, 404);
    }

    if (request.method === "POST" && url.pathname === "/comfy/start") return json(await ensureComfy());

    const input = await body(request);
    if (request.method === "POST" && url.pathname === "/transcribe") return json(enqueue("transcribe", []), 202);
    if (request.method === "POST" && url.pathname === "/plan") return json(enqueue("plan", cliArgsFrom(input, ["lyrics"])), 202);
    if (request.method === "POST" && url.pathname === "/image") {
      numberParam(input, "scene");
      return json(enqueue("image", cliArgsFrom(input, ["scene", "attempt", "seed", "force"])), 202);
    }
    if (request.method === "POST" && url.pathname === "/approve-image") {
      numberParam(input, "scene");
      numberParam(input, "attempt");
      return json(enqueue("approve-image", cliArgsFrom(input, ["scene", "attempt", "score", "report"])), 202);
    }
    if (request.method === "POST" && url.pathname === "/clip") {
      numberParam(input, "scene");
      return json(enqueue("clip", cliArgsFrom(input, ["scene", "attempt", "force"])), 202);
    }
    if (request.method === "POST" && url.pathname === "/extract-frames") {
      numberParam(input, "scene");
      return json(enqueue("extract-frames", cliArgsFrom(input, ["scene", "attempt"])), 202);
    }
    if (request.method === "POST" && url.pathname === "/approve") {
      numberParam(input, "scene");
      numberParam(input, "attempt");
      return json(enqueue("approve", cliArgsFrom(input, ["scene", "attempt", "score", "report"])), 202);
    }
    if (request.method === "POST" && url.pathname === "/render") return json(enqueue("render", cliArgsFrom(input, ["force"])), 202);

    return json({ error: "not found" }, 404);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
}

function stopComfy() {
  if (!comfyProcess || comfyProcess.killed) return;
  comfyProcess.kill("SIGTERM");
}

process.on("SIGINT", () => {
  stopComfy();
  process.exit(130);
});
process.on("SIGTERM", () => {
  stopComfy();
  process.exit(143);
});

mkdirSync(dirname(resolve(configPath)), { recursive: true });
Bun.serve({ port, fetch: route });
console.log(`music-video server listening on http://127.0.0.1:${port}`);
console.log(`config: ${configPath}`);
