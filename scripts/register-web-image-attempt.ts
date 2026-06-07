import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

type Config = {
  workDir?: string;
};

type ImageAttempt = {
  attempt: number;
  image: string;
  seed?: number;
  score?: number;
  report?: string;
  source?: string;
};

type Scene = {
  imageAttempts?: ImageAttempt[];
};

type Plan = {
  scenes: Scene[];
};

function usage(): never {
  console.error(`Usage:
  bun run scripts/register-web-image-attempt.ts -- --scene <N> --attempt <A> --image <path> [--config music-video.config.json] [--source openai-maker]
`);
  process.exit(1);
}

function parseArgs() {
  const flags = new Map<string, string | boolean>();
  const raw = Bun.argv.slice(2).filter((arg) => arg !== "--");

  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = raw[i + 1];
    if (!next || next.startsWith("--")) flags.set(key, true);
    else {
      flags.set(key, next);
      i += 1;
    }
  }

  const scene = Number(flags.get("scene"));
  const attempt = Number(flags.get("attempt"));
  const image = flags.get("image");
  const config = flags.get("config") ?? "music-video.config.json";
  const source = flags.get("source") ?? "openai-maker";

  if (!Number.isInteger(scene) || scene < 1) usage();
  if (!Number.isInteger(attempt) || attempt < 1) usage();
  if (typeof image !== "string") usage();
  if (typeof config !== "string") usage();
  if (typeof source !== "string") usage();

  return { scene, attempt, image, config, source };
}

function readJson<T>(path: string) {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

const { scene, attempt, image, config: configPath, source } = parseArgs();
const config = readJson<Config>(configPath);
const workDir = resolve(dirname(configPath), config.workDir ?? "./work/default");
const planPath = join(workDir, "plan.json");
const imagePath = resolve(image);

if (!existsSync(planPath)) {
  console.error(`missing plan: ${planPath}`);
  process.exit(1);
}

if (!existsSync(imagePath)) {
  console.error(`missing image: ${imagePath}`);
  process.exit(1);
}

const plan = readJson<Plan>(planPath);
const targetScene = plan.scenes[scene - 1];

if (!targetScene) {
  console.error(`scene ${scene} is outside plan range 1-${plan.scenes.length}`);
  process.exit(1);
}

targetScene.imageAttempts = targetScene.imageAttempts ?? [];
const previousIndex = targetScene.imageAttempts.findIndex((item) => item.attempt === attempt);
const previous = previousIndex >= 0 ? targetScene.imageAttempts[previousIndex] : undefined;
const nextAttempt: ImageAttempt = {
  ...previous,
  attempt,
  image: imagePath,
  source,
};

if (previousIndex >= 0) targetScene.imageAttempts[previousIndex] = nextAttempt;
else targetScene.imageAttempts.push(nextAttempt);

targetScene.imageAttempts.sort((a, b) => a.attempt - b.attempt);
writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);

console.log(`registered scene ${scene} image attempt ${attempt}: ${imagePath}`);
