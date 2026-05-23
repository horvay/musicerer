import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const whisperJsonPath = process.argv[2] ?? "work/harbor/captions/words/harbor-words.json";
const outAssPath = process.argv[3] ?? "work/harbor/captions/harbor-word-by-word.ass";
const outTimingPath = process.argv[4] ?? "work/harbor/captions/harbor-corrected-word-timings.json";

const lyricScript = String.raw`
[immediately start voice]
[Opening Scene - low intimate male vocal, no drums, ocean sound]
In a harbor town of ashes, where the ships no longer sailed,
A young man kept the lighthouse while the old world slowly failed.
The sea had swallowed heroes, and the storms had claimed the brave,
So the people learned to whisper,
“Only fools defy the waves.”

[Small Classical Swell - strings enter softly, fragile hope]
But every night he climbed the tower,
Every night he fed the flame,
Watching black waves beat the shoreline
Like they wanted him to stay the same.

[First Lift - restrained cinematic rock, still quiet]
And he dreamed beyond the water,
Past the thunder, past the foam,
Of a land no map remembered,
Of a dawn he’d call his own.
They said, “The sea decides your ending,”
They said, “The deep will drag you down,”
But his heart beat like a war drum
In that dying harbor town.

[Low Return - slow, dark, intimate]
One night a broken sailor came crawling from the rain,
With a silver compass shaking in his hand like living flame.
He said, “There is a country where no master bends the knee,
But the stormwall guards the passage,
And it breaks the souls who flee.”

[Quiet Refrain - memorable, almost whispered]
I was not born for the harbor,
I was not made for the shore.
I hear the storm beyond me,
And I was meant for more.

[Rhythmic Awakening - heartbeat drums enter slowly, strings pulse]
So he raised no royal banner,
Stole no ship and claimed no throne,
Just a cracked and weathered fishing boat
And a sail he stitched alone.
At dawn he left the lantern
Burning bright for all to see,
Then he turned his face to thunder
And surrendered to the sea.

[False Summit - medium-high power metal, exciting but not the final climax]
Sail, sail, into the night,
Chase the fire beyond your sight.
No tide, no chain, no fear, no grave
Can own the heart that dares the wave.
Rise, rise, over the roar,
Find what waits beyond the shore.
The world won’t part the storm for free,
But the brave can name their destiny.

[Sudden Drop - everything cuts out except piano and distant thunder]
Then the sky became a monster,
Then the stars were torn away,
Then the mast cracked like a promise
At the ending of the day.
He lashed it with the rigging,
Bound the sail with bleeding hands,
While the compass spun in circles
Far from any living land.

[Deepest Low - slow, mournful, classical, almost prayer-like]
No lighthouse burned behind him,
No sunrise broke ahead.
No voice rose from the heavens,
No blessing from the dead.
Only rain,
Only foam,
Only one man far from home.

[Quiet Refrain Reprise - softer, wounded but determined]
I was not born for the harbor,
I was not made for the shore.
Even lost beneath the thunder,
I am still meant for more.

[Long Crescendo Begins - strings swell, choir enters, drums build slowly]
Then he saw beneath the water
Not a graveyard, but a light,
Every ship that sank before him
Burning gold beneath the night.
All the lost had left a warning,
All the fallen left a spark,
Not to turn him from the tempest,
But to guide him through the dark.

[Ascending Passage - faster, heavier, galloping drums, guitars enter late]
So he tied himself to the rudder,
Set his eyes upon the flame,
Drove the wounded boat through fury
While the storm screamed out his name.
Higher rose the black waves,
Harder fell the rain,
But the fire in his heartbeat
Rose again, again, again.

[Pre-Climax - full band, choir, not quite exploding yet]
No ocean can own me,
No thunder can drown me,
No grave made of water will be my end.
No fear can command me,
No storm can unman me,
I bend, but I break and ascend.

[Massive Climax - explosive power metal, speed metal drums, choir, soaring male vocals]
I am the sail, I am the flame,
I am the storm that learned my name.
No tide, no night, no raging sea
Can write the end of me.
I am the spark, I am the roar,
I am the dawn beyond the shore.
The world won’t hand me victory,
So I will carve my destiny!

[Climax Extension - even bigger, classical choir and shredding guitars, thunder sounds]
Through the thunder,
Through the fire,
Through the waves that climb higher and higher.
From the wreckage,
From the pain,
I rise like the sun from the rain!

[Final Shore - huge but triumphant, storm breaks, choir opens wide, thunder]
Then the clouds were torn asunder,
And the black sea turned to gold.
There beyond the wall of thunder
Rose the land the sailor told.
No throne above the harbor,
No master on the sand,
No chains upon the people
Of that far and shining land.

[Final Refrain - last verse, powerful but emotionally clear]
I was not born for the harbor,
I was not made for the shore.
And because of the thunder,
I became something more.
`;

type WordTiming = {
  text: string;
  norm: string;
  start: number;
  end: number;
};

type ExactWord = {
  text: string;
  norm: string;
  lineIndex: number;
  wordInLine: number;
  start?: number;
  end?: number;
  matched?: string;
};

function normalizeWord(word: string) {
  return word
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9']/g, "")
    .replace(/^'+|'+$/g, "")
    .replace(/'/g, "");
}

function parseLyrics(script: string) {
  return script
    .replace(/\\u2018/g, "‘")
    .replace(/\\u2019/g, "’")
    .replace(/\\u201C/g, "“")
    .replace(/\\u201D/g, "”")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("["));
}

function escapeAss(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}");
}

function timeFromWhisper(value: string) {
  const match = value.match(/(\d+):(\d+):(\d+),(\d+)/);
  if (!match) return 0;
  const [, hh, mm, ss, ms] = match;
  return Number(hh) * 3600 + Number(mm) * 60 + Number(ss) + Number(ms.padEnd(3, "0")) / 1000;
}

function assTime(seconds: number) {
  const totalCentiseconds = Math.max(0, Math.round(seconds * 100));
  const h = Math.floor(totalCentiseconds / 360000);
  const m = Math.floor((totalCentiseconds % 360000) / 6000);
  const s = Math.floor((totalCentiseconds % 6000) / 100);
  const cs = totalCentiseconds % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function splitTokenText(text: string) {
  return text.trim().split(/\s+/).filter(Boolean);
}

function parseWhisperWords(path: string): WordTiming[] {
  const data = JSON.parse(readFileSync(path, "utf8"));
  const words: WordTiming[] = [];
  for (const segment of data.transcription ?? []) {
    for (const token of segment.tokens ?? []) {
      const raw = String(token.text ?? "");
      if (!raw.trim() || raw.includes("[_")) continue;
      const pieces = splitTokenText(raw);
      if (pieces.length === 0) continue;
      const hasOffsets = token.offsets?.from !== undefined && token.offsets?.to !== undefined;
      const startS = hasOffsets
        ? Number(token.offsets.from) / 1000
        : timeFromWhisper(token.timestamps?.from ?? "0:00:00,000");
      const endS = hasOffsets
        ? Number(token.offsets.to) / 1000
        : timeFromWhisper(token.timestamps?.to ?? "0:00:00,000");
      const step = Math.max(0.05, (endS - startS) / pieces.length);
      for (let i = 0; i < pieces.length; i += 1) {
        const piece = pieces[i];
        const norm = normalizeWord(piece);
        if (!norm) {
          if (words.length > 0) words[words.length - 1].text += piece;
          continue;
        }
        if (/^['’]/.test(piece) && words.length > 0) {
          const prev = words[words.length - 1];
          prev.text += piece;
          prev.norm = normalizeWord(prev.text);
          prev.end = startS + step * (i + 1);
          continue;
        }
        words.push({
          text: piece,
          norm,
          start: startS + step * i,
          end: startS + step * (i + 1),
        });
      }
    }
  }
  return words.filter((word) => Number.isFinite(word.start) && Number.isFinite(word.end) && word.end >= word.start);
}

function levenshtein(a: string, b: string) {
  const dp = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

function similarity(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length > 3 && b.length > 3 && (a.includes(b) || b.includes(a))) return 0.82;
  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}

function matchScore(a: string, b: string) {
  const sim = similarity(a, b);
  if (sim >= 1) return 3.2;
  if (sim >= 0.82) return 1.8;
  if (sim >= 0.62) return 0.7;
  if (a[0] === b[0] && sim >= 0.42) return 0.15;
  return -0.9;
}

function align(exact: ExactWord[], heard: WordTiming[]) {
  const n = exact.length;
  const m = heard.length;
  const gapExact = -0.95;
  const gapHeard = -0.42;
  const dp = Array.from({ length: n + 1 }, () => new Float32Array(m + 1));
  const move = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1));
  for (let i = 1; i <= n; i += 1) {
    dp[i][0] = dp[i - 1][0] + gapExact;
    move[i][0] = 1;
  }
  for (let j = 1; j <= m; j += 1) {
    dp[0][j] = dp[0][j - 1] + gapHeard;
    move[0][j] = 2;
  }
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const diag = dp[i - 1][j - 1] + matchScore(exact[i - 1].norm, heard[j - 1].norm);
      const up = dp[i - 1][j] + gapExact;
      const left = dp[i][j - 1] + gapHeard;
      if (diag >= up && diag >= left) {
        dp[i][j] = diag;
        move[i][j] = 0;
      } else if (up >= left) {
        dp[i][j] = up;
        move[i][j] = 1;
      } else {
        dp[i][j] = left;
        move[i][j] = 2;
      }
    }
  }
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const mv = move[i][j];
    if (mv === 0) {
      const e = exact[i - 1];
      const h = heard[j - 1];
      e.start = h.start;
      e.end = h.end;
      e.matched = h.text;
      i -= 1;
      j -= 1;
    } else if (mv === 1) {
      i -= 1;
    } else {
      j -= 1;
    }
  }
}

function fillMissingTimings(words: ExactWord[]) {
  for (let i = 0; i < words.length; i += 1) {
    if (words[i].start !== undefined) continue;
    let prev = i - 1;
    while (prev >= 0 && words[prev].start === undefined) prev -= 1;
    let next = i + 1;
    while (next < words.length && words[next].start === undefined) next += 1;
    if (prev >= 0 && next < words.length) {
      const span = (words[next].start! - words[prev].end!) / (next - prev);
      words[i].start = words[prev].end! + span * (i - prev - 1);
      words[i].end = words[i].start + Math.max(0.18, span * 0.8);
    } else if (prev >= 0) {
      words[i].start = words[prev].end! + 0.08;
      words[i].end = words[i].start + 0.42;
    } else if (next < words.length) {
      words[i].end = Math.max(0, words[next].start! - 0.08);
      words[i].start = Math.max(0, words[i].end - 0.42);
    } else {
      words[i].start = i * 0.45;
      words[i].end = words[i].start + 0.4;
    }
  }
  for (let i = 1; i < words.length; i += 1) {
    if (words[i].start! < words[i - 1].start!) words[i].start = words[i - 1].start! + 0.03;
    if (words[i].end! <= words[i].start!) words[i].end = words[i].start! + 0.18;
  }
}

function chunkLine(lineWords: ExactWord[]) {
  const chunks: ExactWord[][] = [];
  let current: ExactWord[] = [];
  let chars = 0;
  for (const word of lineWords) {
    const extra = (current.length ? 1 : 0) + word.text.length;
    if (current.length && (current.length >= 6 || chars + extra > 38)) {
      chunks.push(current);
      current = [];
      chars = 0;
    }
    current.push(word);
    chars += extra;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function wordBlock(word: ExactWord, eventStart: number) {
  const rel = Math.max(0, Math.round((word.start! - eventStart) * 1000));
  const fade = 95;
  const settleStart = rel + 220;
  const settleEnd = rel + 620;
  return `{\\alpha&HFF&\\c&H5BC6F6&\\t(${rel},${rel + fade},\\alpha&H00&)\\t(${settleStart},${settleEnd},\\c&HEEF7FF&)}` + escapeAss(word.text);
}

const lines = parseLyrics(lyricScript);
const exactWords: ExactWord[] = [];
lines.forEach((line, lineIndex) => {
  line.split(/\s+/).forEach((text, wordInLine) => {
    const norm = normalizeWord(text);
    if (!norm) return;
    exactWords.push({ text, norm, lineIndex, wordInLine });
  });
});

const heardWords = parseWhisperWords(whisperJsonPath);
align(exactWords, heardWords);
fillMissingTimings(exactWords);

const chunks: ExactWord[][] = [];
for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
  const lineWords = exactWords.filter((word) => word.lineIndex === lineIndex);
  chunks.push(...chunkLine(lineWords));
}

const header = `[Script Info]
Title: Harbor word-by-word captions
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Lyric, Old Master, 68, &H00EEF7FF, &H005BC6F6, &H00100A05, &H96000000, 0, 0, 0, 0, 100, 100, 0.5, 0, 1, 5, 3, 2, 160, 160, 105, 1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

const events: string[] = [];
for (let i = 0; i < chunks.length; i += 1) {
  const chunk = chunks[i];
  const nextChunk = chunks[i + 1];
  const first = chunk[0];
  const last = chunk[chunk.length - 1];
  let start = Math.max(0, first.start! - 0.18);
  let end = Math.min(last.end! + 1.05, nextChunk ? nextChunk[0].start! - 0.08 : last.end! + 1.4);
  if (end <= start + 0.35) end = start + 0.65;
  const body = `{\\an2\\pos(960,918)\\blur0.65}` + chunk.map((word) => wordBlock(word, start)).join(" ");
  events.push(`Dialogue: 0,${assTime(start)},${assTime(end)},Lyric,,0,0,0,,${body}`);
}

mkdirSync(dirname(outAssPath), { recursive: true });
writeFileSync(outAssPath, header + events.join("\n") + "\n");
writeFileSync(outTimingPath, JSON.stringify({
  sourceWhisperJson: whisperJsonPath,
  lyricLines: lines,
  wordCount: exactWords.length,
  heardWordCount: heardWords.length,
  captionChunkCount: chunks.length,
  words: exactWords.map((word) => ({
    text: word.text,
    lineIndex: word.lineIndex,
    start: Number(word.start!.toFixed(3)),
    end: Number(word.end!.toFixed(3)),
    matchedWhisperWord: word.matched,
  })),
}, null, 2));

console.log(`wrote ${outAssPath}`);
console.log(`wrote ${outTimingPath}`);
console.log(`words: ${exactWords.length}, heard: ${heardWords.length}, chunks: ${chunks.length}`);
