import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

type Config = {
  workDir?: string;
};

type ClipAttempt = {
  attempt: number;
  clip: string;
  image?: string;
  seed?: number;
  score?: number;
  report?: string;
  source?: string;
  postUrl?: string;
};

type Scene = {
  image?: string;
  approvedImageAttempt?: number;
  imageAttempts?: { attempt: number; image: string }[];
  attempts?: ClipAttempt[];
  clip?: string;
};

type Plan = {
  scenes: Scene[];
};

function usage(): never {
  console.error(`Usage:
  bun run scripts/register-grok-video-attempt.ts -- --scene <N> --attempt <A> --clip <path> [--image <path>] [--post-url <url>] [--config music-video.config.json] [--source grok-imagine]
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
  const clip = flags.get("clip");
  const image = flags.get("image");
  const postUrl = flags.get("post-url");
  const config = flags.get("config") ?? "music-video.config.json";
  const source = flags.get("source") ?? "grok-imagine";

  if (!Number.isInteger(scene) || scene < 1) usage();
  if (!Number.isInteger(attempt) || attempt < 1) usage();
  if (typeof clip !== "string") usage();
  if (image !== undefined && typeof image !== "string") usage();
  if (postUrl !== undefined && typeof postUrl !== "string") usage();
  if (typeof config !== "string") usage();
  if (typeof source !== "string") usage();

  return { scene, attempt, clip, image, postUrl, config, source };
}

function readJson<T>(path: string) {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function approvedImage(scene: Scene) {
  if (scene.approvedImageAttempt && scene.imageAttempts) {
    const approved = scene.imageAttempts.find((attempt) => attempt.attempt === scene.approvedImageAttempt)?.image;
    if (approved) return approved;
  }
  return scene.image;
}

const { scene, attempt, clip, image, postUrl, config: configPath, source } = parseArgs();
const config = readJson<Config>(configPath);
const workDir = resolve(dirname(configPath), config.workDir ?? "./work/default");
const planPath = join(workDir, "plan.json");
const clipPath = resolve(clip);
const imagePath = image ? resolve(image) : undefined;

if (!existsSync(planPath)) {
  console.error(`missing plan: ${planPath}`);
  process.exit(1);
}

if (!existsSync(clipPath)) {
  console.error(`missing clip: ${clipPath}`);
  process.exit(1);
}

if (imagePath && !existsSync(imagePath)) {
  console.error(`missing image: ${imagePath}`);
  process.exit(1);
}

const plan = readJson<Plan>(planPath);
const targetScene = plan.scenes[scene - 1];

if (!targetScene) {
  console.error(`scene ${scene} is outside plan range 1-${plan.scenes.length}`);
  process.exit(1);
}

targetScene.attempts = targetScene.attempts ?? [];
const previousIndex = targetScene.attempts.findIndex((item) => item.attempt === attempt);
const previous = previousIndex >= 0 ? targetScene.attempts[previousIndex] : undefined;
const nextAttempt: ClipAttempt = {
  attempt,
  clip: clipPath,
  image: imagePath ?? previous?.image ?? approvedImage(targetScene),
  source,
  ...(postUrl ? { postUrl } : {}),
};

if (previousIndex >= 0) targetScene.attempts[previousIndex] = nextAttempt;
else targetScene.attempts.push(nextAttempt);

targetScene.attempts.sort((a, b) => a.attempt - b.attempt);
writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);

console.log(`registered scene ${scene} Grok video attempt ${attempt}: ${clipPath}`);
