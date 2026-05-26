import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, existsSync, readFileSync, writeFileSync, copyFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, resolve, basename } from "node:path";
import { randomUUID } from "node:crypto";

const defaultConfigPath = "./music-video.config.json";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

type ComfyFile = {
  filename: string;
  subfolder?: string;
  type?: string;
  format?: string;
  fullpath?: string;
};

type Config = {
  audio: string;
  workDir?: string;
  output?: string;
  theme?: string;
  visualStyle?: string;

  imagePromptTemplate?: string;
  videoPromptTemplate?: string;
  promptTemplate?: string;
  width?: number;
  height?: number;
  outputWidth?: number;
  outputHeight?: number;
  fps?: number;
  secondsPerClip?: number;
  secondsPerImage?: number;
  fadeSeconds?: number;
  transcript?: string;
  transcription?: {
    command: string;
    args?: string[];
    expectedFile?: string;
  };
  comfy?: {
    path?: string;
    baseUrl?: string;
    launch?: boolean;
    startupTimeoutSeconds?: number;
    workflowApiJson?: string;
    imageWorkflowApiJson?: string;
    videoWorkflowApiJson?: string;
    imagePromptPath?: string;
    videoPromptPath?: string;
    positivePromptPath?: string;
    videoNegativePromptPath?: string;

    seedPath?: string;
    seedPaths?: string[];
    widthPath?: string;
    heightPath?: string;
    widthPaths?: string[];
    heightPaths?: string[];
    fpsPath?: string;
    secondsPath?: string;
    filenamePrefixPath?: string;
    referenceImagePrefixPath?: string;
    outputNodeId?: string | null;
    imageOutputNodeId?: string | null;
    referenceImageNodeId?: string | null;
    videoInputImagePath?: string;
    patches?: { path: string; value: Json }[];
  };
};

type Segment = {
  start: number;
  end: number;
  text: string;
};

type ImageAttempt = {
  attempt: number;
  image: string;
  score?: number;
  report?: string;
};

type ClipAttempt = {
  attempt: number;
  clip: string;
  image?: string;
  score?: number;
  report?: string;
};

type Scene = {
  index: number;
  start: number;
  end: number;
  clipDuration: number;
  lyrics: string;
  imagePrompt: string;
  videoPrompt: string;
  prompt: string;
  videoNegativePrompt?: string;
  seed?: number;
  imageSeed?: number;
  videoSeed?: number;
  image?: string;
  clip?: string;
  approvedImageAttempt?: number;
  approvedAttempt?: number;
  imageAttempts?: ImageAttempt[];
  attempts?: ClipAttempt[];
};

type Plan = {
  audio: string;
  duration: number;
  width: number;
  height: number;
  outputWidth: number;
  outputHeight: number;
  fps: number;
  fadeSeconds: number;
  scenes: Scene[];
};

let comfyProcess: ReturnType<typeof spawn> | undefined;

function usage() {
  console.log(`music-vids: lyric-aware ComfyUI music video pipeline

Usage:
  bun run video init [--config music-video.config.json]
  bun run video transcribe [--config music-video.config.json]
  bun run video plan [--config music-video.config.json] [--lyrics path/to/transcript.srt|.lrc|.txt]
  bun run video image -- --scene 1 [--attempt 1] [--seed 123] [--force]
  bun run video approve-image -- --scene 1 --attempt 1 [--score 9]
  bun run video clips [--config music-video.config.json] [--force]
  bun run video clip -- --scene 1 [--attempt 1] [--force]
  bun run video extract-frames -- --scene 1 --attempt 1
  bun run video approve -- --scene 1 --attempt 1 [--score 8]
  bun run video images [--config music-video.config.json] [--force]   legacy alias for clips
  bun run video render [--config music-video.config.json] [--force]
  bun run video all [--config music-video.config.json] [--force]

Flow:
  transcribe  optional: runs your configured local ASR command
  plan        turns timed lyrics into image/video prompts
  image       generates one Flux still-image attempt for director/critic retry workflows
  approve-image approves one still image for use by the LTX video workflow
  clips       sends each scene to ComfyUI and saves generated MP4 clips
  clip        generates one LTX video attempt from the approved still image
  render      crossfades approved/polished clips over the original WAV with ffmpeg
`);
}

function args() {
  const raw = Bun.argv.slice(2);
  const command = raw[0] && !raw[0].startsWith("-") ? raw.shift()! : "help";
  const flags = new Map<string, string | boolean>();

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

  return { command, flags };
}

function flagString(flags: Map<string, string | boolean>, name: string) {
  const value = flags.get(name);
  return typeof value === "string" ? value : undefined;
}

function flagBool(flags: Map<string, string | boolean>, name: string) {
  return flags.get(name) === true;
}

function ensureDir(path: string) {
  mkdirSync(path, { recursive: true });
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJson(path: string, value: unknown) {
  ensureDir(dirname(path));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  stopComfy();
  process.exit(1);
}

function loadConfig(flags: Map<string, string | boolean>): Config {
  const configPath = flagString(flags, "config") ?? defaultConfigPath;
  if (!existsSync(configPath)) fail(`missing ${configPath}; run: bun run video init`);
  const config = readJson<Config>(configPath);
  if (!config.audio) fail("config.audio is required");
  return config;
}

function configPaths(config: Config) {
  const workDir = resolve(config.workDir ?? "./work/default");
  const planPath = join(workDir, "plan.json");
  const clipsDir = join(workDir, "clips");
  const attemptsDir = join(workDir, "attempts");
  const framesDir = join(workDir, "review-frames");
  const reportsDir = join(workDir, "critic-reports");
  const imagesDir = join(workDir, "images");
  const output = resolve(config.output ?? "./output/music-video.mp4");
  return { workDir, planPath, clipsDir, attemptsDir, framesDir, reportsDir, imagesDir, output };
}

function fileStem(path: string) {
  return basename(path, extname(path));
}

function slug(value: string) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "") || "music-video";
}

function renderTemplate(template: string, vars: Record<string, string | number>) {
  return template.replaceAll(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key: string) => String(vars[key] ?? ""));
}

function secondsToClock(seconds: number) {
  const total = Math.max(0, seconds);
  const minutes = Math.floor(total / 60);
  const wholeSeconds = Math.floor(total % 60);
  return `${minutes}:${wholeSeconds.toString().padStart(2, "0")}`;
}

function ffprobeDuration(media: string) {
  const result = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", media], {
    encoding: "utf8",
  });
  if (result.status !== 0) fail(`ffprobe failed for ${media}: ${result.stderr}`);
  const duration = Number.parseFloat(result.stdout.trim());
  if (!Number.isFinite(duration)) fail(`could not read duration from ${media}`);
  return duration;
}


function run(command: string, commandArgs: string[]) {
  console.log(`$ ${[command, ...commandArgs].join(" ")}`);
  const result = spawnSync(command, commandArgs, { stdio: "inherit" });
  if (result.status !== 0) fail(`${command} failed`);
}

function parseTimestamp(value: string) {
  const match = value.trim().match(/(?:(\d+):)?(\d+):(\d+(?:[,.]\d+)?)/);
  if (!match) return 0;
  return Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3].replace(",", "."));
}

function parseSrt(text: string): Segment[] {
  return text
    .replaceAll("\r\n", "\n")
    .split(/\n\s*\n/g)
    .map((block) => {
      const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
      const timeLine = lines.find((line) => line.includes("-->"));
      if (!timeLine) return undefined;
      const [startRaw, endRaw] = timeLine.split("-->");
      const body = lines.slice(lines.indexOf(timeLine) + 1).join(" ");
      return { start: parseTimestamp(startRaw), end: parseTimestamp(endRaw), text: body };
    })
    .filter((segment): segment is Segment => Boolean(segment?.text));
}

function parseLrc(text: string, duration: number): Segment[] {
  const timed: { start: number; text: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const matches = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    const lyric = line.replaceAll(/\[[^\]]+\]/g, "").trim();
    for (const match of matches) timed.push({ start: Number(match[1]) * 60 + Number(match[2]), text: lyric });
  }
  timed.sort((a, b) => a.start - b.start);
  return timed.map((item, index) => ({ start: item.start, end: timed[index + 1]?.start ?? duration, text: item.text })).filter((segment) => segment.text);
}

function parsePlainLyrics(text: string, duration: number, secondsPerClip: number): Segment[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const targetScenes = Math.max(1, Math.ceil(duration / secondsPerClip));
  const linesPerScene = Math.max(1, Math.ceil(lines.length / targetScenes));
  const chunks: string[] = [];
  for (let i = 0; i < lines.length; i += linesPerScene) chunks.push(lines.slice(i, i + linesPerScene).join(" / "));
  const sceneDuration = duration / chunks.length;
  return chunks.map((text, index) => ({ start: index * sceneDuration, end: index === chunks.length - 1 ? duration : (index + 1) * sceneDuration, text }));
}

function readSegments(path: string, duration: number, secondsPerClip: number) {
  const text = readFileSync(path, "utf8");
  const extension = extname(path).toLowerCase();
  if (extension === ".srt" || text.includes("-->")) return parseSrt(text);
  if (extension === ".lrc" || /^\[\d+:\d+/m.test(text)) return parseLrc(text, duration);
  return parsePlainLyrics(text, duration, secondsPerClip);
}

function createUntimedSegments(duration: number, secondsPerClip: number): Segment[] {
  const count = Math.max(1, Math.ceil(duration / secondsPerClip));
  return Array.from({ length: count }, (_, index) => ({ start: (duration * index) / count, end: (duration * (index + 1)) / count, text: "" }));
}

function groupSegments(segments: Segment[], duration: number, secondsPerClip: number): Segment[] {
  if (segments.length === 0) return createUntimedSegments(duration, secondsPerClip);
  const scenes: Segment[] = [];
  let current: Segment | undefined;

  for (const segment of segments) {
    if (!current) {
      current = { ...segment };
      continue;
    }
    if (segment.end - current.start <= secondsPerClip * 1.35) {
      current.end = segment.end;
      current.text = `${current.text} ${segment.text}`.trim();
    } else {
      scenes.push(current);
      current = { ...segment };
    }
  }
  if (current) scenes.push(current);
  if (scenes[0]) scenes[0].start = 0;
  if (scenes.at(-1)) scenes[scenes.length - 1].end = duration;
  for (let i = 1; i < scenes.length; i += 1) scenes[i].start = scenes[i - 1].end;
  return scenes;
}

function promptVars(config: Config, scene: Segment) {
  return {
    theme: config.theme ?? "the emotional world of the song",
    visualStyle: config.visualStyle ?? "cinematic, atmospheric, coherent, no text",
    lyrics: scene.text || "instrumental passage",
    time: secondsToClock(scene.start),
    start: scene.start.toFixed(2),
    end: scene.end.toFixed(2),
  };
}

function makeImagePrompt(config: Config, scene: Segment) {
  const template = config.imagePromptTemplate ?? config.promptTemplate ?? "A cinematic music-video still frame in {{visualStyle}}. Theme: {{theme}}. Time: {{time}}. Lyrics: {{lyrics}}. Describe one exact Flux image with subject, foreground, midground, background, camera angle, lighting, mood, and era.";
  return renderTemplate(template, promptVars(config, scene));
}

function makeVideoPrompt(config: Config, scene: Segment) {
  const template = config.videoPromptTemplate ?? "Music video motion prompt. Theme: {{theme}}. Style: {{visualStyle}}. Time: {{time}}. Lyrics: {{lyrics}}. Describe cinematic movement, atmosphere, and emotion. No text or captions.";
  return renderTemplate(template, promptVars(config, scene));
}

function commandInit(flags: Map<string, string | boolean>) {
  const target = flagString(flags, "config") ?? defaultConfigPath;
  if (existsSync(target)) fail(`${target} already exists`);
  copyFileSync("music-video.config.example.json", target);
  console.log(`created ${target}`);
}

function commandTranscribe(config: Config) {
  const { workDir } = configPaths(config);
  ensureDir(workDir);
  if (!config.transcription?.command) fail("config.transcription.command is required");
  const audio = resolve(config.audio);
  const vars = { audio, audioStem: fileStem(audio), workDir };
  const commandArgs = (config.transcription.args ?? []).map((arg) => renderTemplate(arg, vars));
  run(config.transcription.command, commandArgs);
  if (config.transcription.expectedFile) {
    const expected = renderTemplate(config.transcription.expectedFile, vars);
    if (!existsSync(expected)) fail(`transcription finished, but expected file was not found: ${expected}`);
    console.log(`transcript: ${expected}`);
  }
}

function transcriptTextFromSegments(segments: Segment[]) {
  return segments.map((segment) => `[${secondsToClock(segment.start)}-${secondsToClock(segment.end)}] ${segment.text}`.trim()).join("\n");
}

function commandPlan(config: Config, flags: Map<string, string | boolean>) {
  const { workDir, planPath } = configPaths(config);
  ensureDir(workDir);
  const audio = resolve(config.audio);
  if (!existsSync(audio)) fail(`audio not found: ${audio}`);

  const duration = ffprobeDuration(audio);
  const secondsPerClip = config.secondsPerClip ?? config.secondsPerImage ?? 10;
  const fadeSeconds = config.fadeSeconds ?? 1.2;
  const transcript = flagString(flags, "lyrics") ?? config.transcript;
  const rawSegments = transcript && existsSync(transcript) ? readSegments(transcript, duration, secondsPerClip) : createUntimedSegments(duration, secondsPerClip);
  if (transcript && existsSync(transcript)) writeFileSync(join(workDir, "transcript.txt"), `${transcriptTextFromSegments(rawSegments)}\n`);
  const grouped = groupSegments(rawSegments, duration, secondsPerClip);
  const scenes = grouped.map((scene, index): Scene => {
    const isLast = index === grouped.length - 1;
    const clipDuration = Math.max(1, scene.end - scene.start + (isLast ? 0 : fadeSeconds));
    const imagePrompt = makeImagePrompt(config, scene);
    const videoPrompt = makeVideoPrompt(config, scene);
    return { index, start: scene.start, end: scene.end, clipDuration, lyrics: scene.text, imagePrompt, videoPrompt, prompt: imagePrompt };
  });

  const plan: Plan = {
    audio,
    duration,
    width: config.width ?? 1280,
    height: config.height ?? 720,
    outputWidth: config.outputWidth ?? 1920,
    outputHeight: config.outputHeight ?? 1080,
    fps: config.fps ?? 24,
    fadeSeconds,
    scenes,
  };
  writeJson(planPath, plan);
  console.log(`wrote ${planPath}`);
  if (!transcript || !existsSync(transcript)) console.log("note: no transcript was found, so prompts are timed instrumental/theme scenes only");
  console.log(`scenes: ${scenes.length}`);
}

function getByPath(root: Json, path: string): Json | undefined {
  let current: Json | undefined = root;
  for (const part of path.split(".")) {
    if (current && typeof current === "object" && !Array.isArray(current)) current = current[part];
    else return undefined;
  }
  return current;
}

function setByPath(root: Json, path: string, value: Json) {
  const parts = path.split(".");
  let current = root;
  for (const part of parts.slice(0, -1)) {
    if (!current || typeof current !== "object" || Array.isArray(current)) fail(`bad workflow patch path: ${path}`);
    current = current[part];
  }
  const last = parts.at(-1);
  if (!last || !current || typeof current !== "object" || Array.isArray(current)) fail(`bad workflow patch path: ${path}`);
  current[last] = value;
}

function setByPathIfPresent(root: Json, path: string | undefined, value: Json) {
  if (!path || getByPath(root, path) === undefined) return;
  setByPath(root, path, value);
}

function comfyWorkflowPath(config: Config, mode: "image" | "video") {
  const comfy = config.comfy;
  const path = mode === "video" ? comfy?.videoWorkflowApiJson : comfy?.imageWorkflowApiJson;
  if (!path) fail(`config.comfy.${mode === "video" ? "videoWorkflowApiJson" : "imageWorkflowApiJson"} is required`);
  return path;
}

function randomSeed() {
  return Math.floor(Math.random() * 1_000_000_000_000_000);
}

function sceneSeed(scene: Scene, mode: "image" | "video", seedOverride?: number) {
  if (Number.isFinite(seedOverride)) return seedOverride!;
  const seed = mode === "video" ? scene.videoSeed ?? scene.seed : scene.imageSeed ?? scene.seed;
  return Number.isFinite(seed) ? seed! : randomSeed();
}

function appendNegativePrompt(workflow: Json, path: string | undefined, extra: string | undefined) {
  if (!path || !extra?.trim()) return;
  const current = getByPath(workflow, path);
  if (typeof current !== "string") fail(`negative prompt path ${path} did not resolve to a string`);
  const separator = current.trim() ? ", " : "";
  setByPath(workflow, path, `${current}${separator}${extra.trim()}`);
}

function patchWorkflow(config: Config, plan: Plan, scene: Scene, mode: "image" | "video", inputImageName?: string, seedOverride?: number) {
  const comfy = config.comfy;
  const workflow = readJson<Json>(comfyWorkflowPath(config, mode));
  const seed = sceneSeed(scene, mode, seedOverride);

  if (mode === "image" && comfy?.imagePromptPath) setByPath(workflow, comfy.imagePromptPath, scene.imagePrompt);
  if (mode === "video" && comfy?.videoPromptPath) setByPath(workflow, comfy.videoPromptPath, scene.videoPrompt);
  if (mode === "video") appendNegativePrompt(workflow, comfy?.videoNegativePromptPath, scene.videoNegativePrompt);
  if (mode === "video" && comfy?.positivePromptPath) setByPathIfPresent(workflow, comfy.positivePromptPath, scene.videoPrompt);
  if (mode === "video" && inputImageName && comfy?.videoInputImagePath) setByPath(workflow, comfy.videoInputImagePath, inputImageName);
  if (comfy?.seedPath) setByPathIfPresent(workflow, comfy.seedPath, seed);
  const seedPaths = comfy?.seedPaths ?? [];
  for (const path of seedPaths) setByPathIfPresent(workflow, path, seed);
  if (comfy?.widthPath) setByPathIfPresent(workflow, comfy.widthPath, plan.width);
  if (comfy?.heightPath) setByPathIfPresent(workflow, comfy.heightPath, plan.height);
  for (const path of comfy?.widthPaths ?? []) setByPathIfPresent(workflow, path, plan.width);
  for (const path of comfy?.heightPaths ?? []) setByPathIfPresent(workflow, path, plan.height);
  if (comfy?.fpsPath) setByPathIfPresent(workflow, comfy.fpsPath, plan.fps);
  if (comfy?.secondsPath) setByPathIfPresent(workflow, comfy.secondsPath, Math.ceil(scene.clipDuration));
  if (mode === "video" && comfy?.filenamePrefixPath) {
    const prefix = `video/music-vids/${slug(fileStem(plan.audio))}/${String(scene.index + 1).padStart(4, "0")}`;
    setByPath(workflow, comfy.filenamePrefixPath, prefix);
  }
  if (mode === "image" && comfy?.referenceImagePrefixPath) {
    const prefix = `image/music-vids/${slug(fileStem(plan.audio))}/${String(scene.index + 1).padStart(4, "0")}`;
    setByPath(workflow, comfy.referenceImagePrefixPath, prefix);
  }

  for (const patch of comfy?.patches ?? []) {
    const value = typeof patch.value === "string"
      ? renderTemplate(patch.value, {
        imagePrompt: scene.imagePrompt,
        videoPrompt: scene.videoPrompt,
        prompt: scene.videoPrompt,
        inputImage: inputImageName ?? "",
        seed,
        width: plan.width,
        height: plan.height,
        fps: plan.fps,
        seconds: Math.ceil(scene.clipDuration),
        time: secondsToClock(scene.start),
        lyrics: scene.lyrics,
      })
      : patch.value;
    setByPath(workflow, patch.path, value);
  }

  if (mode === "image" && comfy?.imagePromptPath && getByPath(workflow, comfy.imagePromptPath) !== scene.imagePrompt) fail(`failed to patch image prompt at ${comfy.imagePromptPath}`);
  if (mode === "video" && comfy?.videoPromptPath && getByPath(workflow, comfy.videoPromptPath) !== scene.videoPrompt) fail(`failed to patch video prompt at ${comfy.videoPromptPath}`);
  if (mode === "video" && inputImageName && comfy?.videoInputImagePath && getByPath(workflow, comfy.videoInputImagePath) !== inputImageName) fail(`failed to patch input image at ${comfy.videoInputImagePath}`);
  return workflow;
}

async function urlOk(url: string) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

function stopComfy() {
  if (!comfyProcess || comfyProcess.killed) return;
  comfyProcess.kill("SIGTERM");
  comfyProcess = undefined;
}

async function ensureComfy(config: Config) {
  const baseUrl = config.comfy?.baseUrl ?? "http://127.0.0.1:8188";
  if (await urlOk(`${baseUrl}/system_stats`)) return baseUrl;
  if (!config.comfy?.launch) fail(`ComfyUI is not reachable at ${baseUrl}`);
  if (!config.comfy.path) fail("config.comfy.path is required when comfy.launch is true");

  const comfyPath = resolve(config.comfy.path);
  const python = existsSync(join(comfyPath, ".venv/bin/python")) ? join(comfyPath, ".venv/bin/python") : "python3";
  console.log(`starting ComfyUI in ${comfyPath}`);
  comfyProcess = spawn(python, ["main.py", "--disable-auto-launch"], {
    cwd: comfyPath,
    stdio: "inherit",
    detached: false,
  });

  const deadline = Date.now() + (config.comfy.startupTimeoutSeconds ?? 120) * 1000;
  while (Date.now() < deadline) {
    if (await urlOk(`${baseUrl}/system_stats`)) return baseUrl;
    await Bun.sleep(1000);
  }
  fail(`timed out waiting for ComfyUI at ${baseUrl}`);
}

async function comfyQueue(baseUrl: string, workflow: Json) {
  const response = await fetch(`${baseUrl}/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: workflow, client_id: randomUUID() }),
  });
  if (!response.ok) fail(`ComfyUI /prompt failed: ${response.status} ${await response.text()}`);
  const data = await response.json() as { prompt_id?: string };
  if (!data.prompt_id) fail("ComfyUI did not return prompt_id");
  return data.prompt_id;
}

async function comfyHistory(baseUrl: string, promptId: string) {
  while (true) {
    const response = await fetch(`${baseUrl}/history/${promptId}`);
    if (response.ok) {
      const data = await response.json() as Record<string, { outputs?: Record<string, { images?: ComfyFile[]; gifs?: ComfyFile[]; videos?: ComfyFile[] }> }>;
      if (data[promptId]) return data[promptId];
    }
    await Bun.sleep(1000);
  }
}

type ComfyOutput = { images?: ComfyFile[]; gifs?: ComfyFile[]; videos?: ComfyFile[] };

function firstComfyOutput(history: Awaited<ReturnType<typeof comfyHistory>>, outputNodeId?: string | null) {
  const outputs = history.outputs ?? {};
  const pick = (output?: ComfyOutput) => output?.videos?.[0] ?? output?.gifs?.[0] ?? output?.images?.[0];
  if (outputNodeId) {
    const file = pick(outputs[outputNodeId]);
    if (file) return file;
    fail(`no media found at configured output node ${outputNodeId}`);
  }
  for (const output of Object.values(outputs)) {
    const file = pick(output);
    if (file) return file;
  }
  fail("ComfyUI finished, but no media output was found");
}

function firstComfyImage(history: Awaited<ReturnType<typeof comfyHistory>>, outputNodeId?: string | null) {
  if (!outputNodeId) return undefined;
  return history.outputs?.[outputNodeId]?.images?.[0];
}

function extensionForComfyFile(file: ComfyFile) {
  const fromName = extname(file.filename);
  if (fromName) return fromName;
  if (file.format?.includes("mp4")) return ".mp4";
  if (file.format?.includes("webm")) return ".webm";
  if (file.format?.includes("gif")) return ".gif";
  return ".png";
}

async function downloadComfyFile(baseUrl: string, file: ComfyFile, target: string) {
  const params = new URLSearchParams({ filename: file.filename, type: file.type ?? "output" });
  if (file.subfolder) params.set("subfolder", file.subfolder);
  const response = await fetch(`${baseUrl}/view?${params.toString()}`);
  if (!response.ok) fail(`ComfyUI /view failed: ${response.status} ${await response.text()}`);
  writeFileSync(target, Buffer.from(await response.arrayBuffer()));
}

async function generateImageAttempt(config: Config, plan: Plan, scene: Scene, attempt: number, force: boolean, seedOverride?: number) {
  const { attemptsDir, planPath } = configPaths(config);
  const sceneDir = join(attemptsDir, `scene-${String(scene.index + 1).padStart(4, "0")}`);
  ensureDir(sceneDir);

  const existing = scene.imageAttempts?.find((item) => item.attempt === attempt)?.image;
  if (existing && existsSync(existing) && !force) {
    console.log(`skip existing image attempt: ${existing}`);
    return existing;
  }

  const baseUrl = await ensureComfy(config);
  console.log(`ComfyUI image scene ${scene.index + 1}/${plan.scenes.length}, attempt ${attempt}: ${secondsToClock(scene.start)} ${scene.lyrics.slice(0, 80)}`);
  const workflow = patchWorkflow(config, plan, scene, "image", undefined, seedOverride);
  const promptId = await comfyQueue(baseUrl, workflow);
  const history = await comfyHistory(baseUrl, promptId);
  const output = firstComfyImage(history, config.comfy?.imageOutputNodeId ?? config.comfy?.referenceImageNodeId ?? config.comfy?.outputNodeId);
  if (!output) fail("ComfyUI finished, but no image output was found");
  const target = join(sceneDir, `image-attempt-${attempt}${extensionForComfyFile(output)}`);
  await downloadComfyFile(baseUrl, output, target);

  scene.imageAttempts = scene.imageAttempts ?? [];
  const previous = scene.imageAttempts.findIndex((item) => item.attempt === attempt);
  const item = { attempt, image: target };
  if (previous >= 0) scene.imageAttempts[previous] = { ...scene.imageAttempts[previous], ...item };
  else scene.imageAttempts.push(item);
  writeJson(planPath, plan);
  console.log(`saved image ${target}`);
  return target;
}

function approvedImage(scene: Scene) {
  if (scene.approvedImageAttempt && scene.imageAttempts) {
    const approved = scene.imageAttempts.find((attempt) => attempt.attempt === scene.approvedImageAttempt)?.image;
    if (approved) return approved;
  }
  return scene.image;
}

function prepareComfyInputImage(config: Config, plan: Plan, scene: Scene) {
  const image = approvedImage(scene);
  if (!image || !existsSync(image)) fail(`missing approved image for scene ${scene.index + 1}: run image critique and approve-image first`);
  const comfyPath = config.comfy?.path;
  if (!comfyPath) fail("config.comfy.path is required to copy approved images into ComfyUI input");
  const relative = join("music-vids", slug(fileStem(plan.audio)), `scene-${String(scene.index + 1).padStart(4, "0")}${extname(image) || ".png"}`);
  const target = join(comfyPath, "input", relative);
  ensureDir(dirname(target));
  copyFileSync(image, target);
  return relative.replaceAll("\\", "/");
}

async function generateClipAttempt(config: Config, plan: Plan, scene: Scene, attempt: number, force: boolean) {
  const { attemptsDir, planPath } = configPaths(config);
  const sceneDir = join(attemptsDir, `scene-${String(scene.index + 1).padStart(4, "0")}`);
  ensureDir(sceneDir);

  const existing = scene.attempts?.find((item) => item.attempt === attempt)?.clip;
  if (existing && existsSync(existing) && !force) {
    console.log(`skip existing attempt: ${existing}`);
    return existing;
  }

  const baseUrl = await ensureComfy(config);
  const inputImageName = prepareComfyInputImage(config, plan, scene);
  console.log(`ComfyUI video scene ${scene.index + 1}/${plan.scenes.length}, attempt ${attempt}: ${secondsToClock(scene.start)} ${scene.lyrics.slice(0, 80)}`);
  const workflow = patchWorkflow(config, plan, scene, "video", inputImageName);
  const promptId = await comfyQueue(baseUrl, workflow);
  const history = await comfyHistory(baseUrl, promptId);
  const output = firstComfyOutput(history, config.comfy?.outputNodeId);
  const target = join(sceneDir, `attempt-${attempt}${extensionForComfyFile(output)}`);
  await downloadComfyFile(baseUrl, output, target);

  scene.attempts = scene.attempts ?? [];
  const previous = scene.attempts.findIndex((item) => item.attempt === attempt);
  const item = { attempt, clip: target, image: approvedImage(scene) };
  if (previous >= 0) scene.attempts[previous] = { ...scene.attempts[previous], ...item };
  else scene.attempts.push(item);
  scene.clip = target;
  writeJson(planPath, plan);
  console.log(`saved ${target}`);
  return target;
}

async function commandImage(config: Config, flags: Map<string, string | boolean>) {
  const { planPath } = configPaths(config);
  if (!existsSync(planPath)) fail(`missing ${planPath}; run: bun run plan`);
  const plan = readJson<Plan>(planPath);
  const sceneNumber = Number(flagString(flags, "scene") ?? "0");
  const attempt = Number(flagString(flags, "attempt") ?? "1");
  if (!Number.isInteger(sceneNumber) || sceneNumber < 1 || sceneNumber > plan.scenes.length) fail(`--scene must be 1-${plan.scenes.length}`);
  if (!Number.isInteger(attempt) || attempt < 1) fail("--attempt must be a positive integer");
  const seedRaw = flagString(flags, "seed");
  const seedOverride = seedRaw === undefined ? undefined : Number(seedRaw);
  if (seedOverride !== undefined && (!Number.isFinite(seedOverride) || seedOverride < 0)) fail("--seed must be a non-negative number");
  try {
    await generateImageAttempt(config, plan, plan.scenes[sceneNumber - 1]!, attempt, flagBool(flags, "force"), seedOverride);
  } finally {
    stopComfy();
  }
}

async function commandClip(config: Config, flags: Map<string, string | boolean>) {
  const { planPath } = configPaths(config);
  if (!existsSync(planPath)) fail(`missing ${planPath}; run: bun run plan`);
  const plan = readJson<Plan>(planPath);
  const sceneNumber = Number(flagString(flags, "scene") ?? "0");
  const attempt = Number(flagString(flags, "attempt") ?? "1");
  if (!Number.isInteger(sceneNumber) || sceneNumber < 1 || sceneNumber > plan.scenes.length) fail(`--scene must be 1-${plan.scenes.length}`);
  if (!Number.isInteger(attempt) || attempt < 1) fail("--attempt must be a positive integer");
  try {
    await generateClipAttempt(config, plan, plan.scenes[sceneNumber - 1]!, attempt, flagBool(flags, "force"));
  } finally {
    stopComfy();
  }
}

async function commandClips(config: Config, flags: Map<string, string | boolean>) {
  const { planPath } = configPaths(config);
  if (!existsSync(planPath)) fail(`missing ${planPath}; run: bun run plan`);
  const plan = readJson<Plan>(planPath);
  const force = flagBool(flags, "force");

  try {
    for (const scene of plan.scenes) {
      const existing = scene.clip && existsSync(scene.clip) ? scene.clip : undefined;
      if (existing && !force) {
        console.log(`skip existing approved/current clip: ${existing}`);
        continue;
      }
      await generateClipAttempt(config, plan, scene, 1, force);
    }
  } finally {
    stopComfy();
  }

  writeJson(planPath, plan);
}

function ffmpegClipFilter(plan: Plan, clipDurations: number[]) {
  const filters: string[] = [];
  const fade = Math.max(0.1, plan.fadeSeconds);
  const outputWidth = plan.outputWidth ?? 1920;
  const outputHeight = plan.outputHeight ?? 1080;
  const desiredDurations = plan.scenes.map((scene, index) => Math.max(0.1, scene.end - scene.start + (index === plan.scenes.length - 1 ? 0 : fade)));

  for (const scene of plan.scenes) {
    const sourceDuration = Math.max(0.1, clipDurations[scene.index] ?? scene.clipDuration ?? desiredDurations[scene.index] ?? 1);
    const desiredDuration = desiredDurations[scene.index] ?? sourceDuration;
    const base = `scale=${outputWidth}:${outputHeight}:force_original_aspect_ratio=increase,crop=${outputWidth}:${outputHeight},setsar=1,fps=${plan.fps},format=yuv420p`;
    const stretchFactor = desiredDuration / sourceDuration;
    const durationFilter = stretchFactor > 1.01
      ? `setpts=${stretchFactor.toFixed(6)}*PTS,minterpolate=fps=${plan.fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,trim=duration=${desiredDuration.toFixed(3)},setpts=PTS-STARTPTS`
      : `setpts=${stretchFactor.toFixed(6)}*PTS,trim=duration=${desiredDuration.toFixed(3)},setpts=PTS-STARTPTS`;
    filters.push(`[${scene.index}:v]${base},${durationFilter}[v${scene.index}]`);
  }

  if (plan.scenes.length === 1) {
    filters.push(`[v0]trim=duration=${plan.duration.toFixed(3)},setpts=PTS-STARTPTS[v]`);
    return filters.join(";");
  }

  let previous = "v0";
  let previousDuration = desiredDurations[0] ?? plan.scenes[0]?.clipDuration ?? 1;
  for (let i = 1; i < plan.scenes.length; i += 1) {
    const out = i === plan.scenes.length - 1 ? "v" : `x${i}`;
    const offset = Math.max(0.1, previousDuration - fade);
    filters.push(`[${previous}][v${i}]xfade=transition=fade:duration=${fade.toFixed(3)}:offset=${offset.toFixed(3)}[${out}]`);
    previous = out;
    previousDuration = previousDuration + (desiredDurations[i] ?? plan.scenes[i]?.clipDuration ?? 1) - fade;
  }
  return filters.join(";");
}

function approvedClip(scene: Scene) {
  if (scene.clip && existsSync(scene.clip)) return scene.clip;
  if (scene.approvedAttempt && scene.attempts) {
    const approved = scene.attempts.find((attempt) => attempt.attempt === scene.approvedAttempt)?.clip;
    if (approved) return approved;
  }
  return scene.clip;
}

function commandExtractFrames(config: Config, flags: Map<string, string | boolean>) {
  const { planPath, framesDir } = configPaths(config);
  if (!existsSync(planPath)) fail(`missing ${planPath}; run: bun run plan`);
  const plan = readJson<Plan>(planPath);
  const sceneNumber = Number(flagString(flags, "scene") ?? "0");
  const attemptNumber = Number(flagString(flags, "attempt") ?? "0");
  if (!Number.isInteger(sceneNumber) || sceneNumber < 1 || sceneNumber > plan.scenes.length) fail(`--scene must be 1-${plan.scenes.length}`);
  const scene = plan.scenes[sceneNumber - 1]!;
  const clip = attemptNumber > 0 ? scene.attempts?.find((attempt) => attempt.attempt === attemptNumber)?.clip : approvedClip(scene);
  if (!clip || !existsSync(clip)) fail(`missing clip for scene ${sceneNumber}, attempt ${attemptNumber || "approved"}`);

  const targetDir = join(framesDir, `scene-${String(sceneNumber).padStart(4, "0")}`, `attempt-${attemptNumber || scene.approvedAttempt || "current"}`);
  ensureDir(targetDir);
  const duration = ffprobeDuration(clip);
  const times = [0.08, 0.28, 0.5, 0.72, 0.92].map((ratio) => Math.max(0, Math.min(duration - 0.05, duration * ratio)));
  times.forEach((time, index) => {
    run("ffmpeg", ["-hide_banner", "-y", "-ss", time.toFixed(3), "-i", clip, "-frames:v", "1", "-vf", "scale=512:-1", join(targetDir, `frame-${index + 1}.jpg`)]);
  });
  console.log(targetDir);
}

function commandApproveImage(config: Config, flags: Map<string, string | boolean>) {
  const { planPath, imagesDir, reportsDir } = configPaths(config);
  if (!existsSync(planPath)) fail(`missing ${planPath}; run: bun run plan`);
  const plan = readJson<Plan>(planPath);
  const sceneNumber = Number(flagString(flags, "scene") ?? "0");
  const attemptNumber = Number(flagString(flags, "attempt") ?? "0");
  const score = Number(flagString(flags, "score") ?? "0");
  const report = flagString(flags, "report");
  if (!Number.isInteger(sceneNumber) || sceneNumber < 1 || sceneNumber > plan.scenes.length) fail(`--scene must be 1-${plan.scenes.length}`);
  if (!Number.isInteger(attemptNumber) || attemptNumber < 1) fail("--attempt is required");
  const scene = plan.scenes[sceneNumber - 1]!;
  const attempt = scene.imageAttempts?.find((item) => item.attempt === attemptNumber);
  if (!attempt?.image || !existsSync(attempt.image)) fail(`missing scene ${sceneNumber} image attempt ${attemptNumber}`);

  attempt.score = Number.isFinite(score) ? score : undefined;
  if (report) attempt.report = report;
  scene.approvedImageAttempt = attemptNumber;
  ensureDir(imagesDir);
  const approvedPath = join(imagesDir, `${String(sceneNumber).padStart(4, "0")}${extname(attempt.image) || ".png"}`);
  copyFileSync(attempt.image, approvedPath);
  scene.image = approvedPath;
  if (report) {
    ensureDir(reportsDir);
    writeFileSync(join(reportsDir, `scene-${String(sceneNumber).padStart(4, "0")}-image-attempt-${attemptNumber}.md`), `${report}\n`);
  }
  writeJson(planPath, plan);
  console.log(`approved scene ${sceneNumber} image attempt ${attemptNumber}: ${approvedPath}`);
}

function commandApprove(config: Config, flags: Map<string, string | boolean>) {
  const { planPath, clipsDir, reportsDir } = configPaths(config);
  if (!existsSync(planPath)) fail(`missing ${planPath}; run: bun run plan`);
  const plan = readJson<Plan>(planPath);
  const sceneNumber = Number(flagString(flags, "scene") ?? "0");
  const attemptNumber = Number(flagString(flags, "attempt") ?? "0");
  const score = Number(flagString(flags, "score") ?? "0");
  const report = flagString(flags, "report");
  if (!Number.isInteger(sceneNumber) || sceneNumber < 1 || sceneNumber > plan.scenes.length) fail(`--scene must be 1-${plan.scenes.length}`);
  if (!Number.isInteger(attemptNumber) || attemptNumber < 1) fail("--attempt is required");
  const scene = plan.scenes[sceneNumber - 1]!;
  const attempt = scene.attempts?.find((item) => item.attempt === attemptNumber);
  if (!attempt?.clip || !existsSync(attempt.clip)) fail(`missing scene ${sceneNumber} attempt ${attemptNumber}`);

  attempt.score = Number.isFinite(score) ? score : undefined;
  if (report) attempt.report = report;
  scene.approvedAttempt = attemptNumber;
  ensureDir(clipsDir);
  const approvedPath = join(clipsDir, `${String(sceneNumber).padStart(4, "0")}${extname(attempt.clip) || ".mp4"}`);
  copyFileSync(attempt.clip, approvedPath);
  scene.clip = approvedPath;
  if (report) {
    ensureDir(reportsDir);
    writeFileSync(join(reportsDir, `scene-${String(sceneNumber).padStart(4, "0")}-attempt-${attemptNumber}.md`), `${report}\n`);
  }
  writeJson(planPath, plan);
  console.log(`approved scene ${sceneNumber} attempt ${attemptNumber}: ${approvedPath}`);
}

function commandRender(config: Config, flags: Map<string, string | boolean>) {
  const { planPath, output } = configPaths(config);
  if (!existsSync(planPath)) fail(`missing ${planPath}; run: bun run plan`);
  const plan = readJson<Plan>(planPath);
  if (existsSync(output) && !flagBool(flags, "force")) fail(`${output} exists; pass --force to overwrite`);

  const commandArgs = ["-hide_banner", "-y"];
  const clipDurations: number[] = [];
  for (const scene of plan.scenes) {
    const clip = approvedClip(scene);
    if (!clip || !existsSync(clip)) fail(`missing approved clip for scene ${scene.index + 1}: run the agent workflow`);
    commandArgs.push("-i", clip);
    clipDurations.push(ffprobeDuration(clip));
  }
  commandArgs.push("-i", plan.audio);
  commandArgs.push(
    "-filter_complex", ffmpegClipFilter(plan, clipDurations),
    "-map", "[v]",
    "-map", `${plan.scenes.length}:a`,
    "-t", plan.duration.toFixed(3),
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "18",
    "-r", String(plan.fps),
    "-pix_fmt", "yuv420p",
    "-af", "volume=1.3dB",
    "-c:a", "aac",
    "-b:a", "320k",
    "-movflags", "+faststart",
    output,
  );

  ensureDir(dirname(output));
  run("ffmpeg", commandArgs);
  console.log(`wrote ${output}`);
}

async function main() {
  const { command, flags } = args();
  if (command === "help" || command === "--help" || command === "-h") {
    usage();
    return;
  }
  if (command === "init") {
    commandInit(flags);
    return;
  }

  const config = loadConfig(flags);
  if (command === "transcribe") commandTranscribe(config);
  else if (command === "plan") commandPlan(config, flags);
  else if (command === "image") await commandImage(config, flags);
  else if (command === "approve-image") commandApproveImage(config, flags);
  else if (command === "clip") await commandClip(config, flags);
  else if (command === "clips" || command === "images") await commandClips(config, flags);
  else if (command === "extract-frames") commandExtractFrames(config, flags);
  else if (command === "approve") commandApprove(config, flags);
  else if (command === "render") commandRender(config, flags);
  else if (command === "all") {
    commandPlan(config, flags);
    await commandClips(config, flags);
    commandRender(config, flags);
  } else {
    usage();
    fail(`unknown command: ${command}`);
  }
}

process.on("SIGINT", () => {
  stopComfy();
  process.exit(130);
});
process.on("SIGTERM", () => {
  stopComfy();
  process.exit(143);
});

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
