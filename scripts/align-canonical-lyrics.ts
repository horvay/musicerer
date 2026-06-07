import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

type Word = { word: string; start?: number; end?: number; score?: number };
type Segment = { words?: Word[] };
type Token = { word: string; norm: string; line: number };
type AlignedWord = { word: string; start: number; end: number; source: 'whisperx' | 'interpolated'; confidence?: number };
type AlignedLine = { section: string; text: string; start: number; end: number; words: AlignedWord[]; notes?: string[] };

const workDir = process.argv[2] ?? 'work/freedom';
const canonicalPath = process.argv[3] ?? join(workDir, 'canonical-lyrics.txt');
const transcriptPath = join(workDir, 'transcript.json');
const outJson = join(workDir, 'corrected-alignment.json');
const outSrt = join(workDir, 'corrected-transcript.srt');
const outReport = join(workDir, 'transcript-alignment-report.md');

function norm(s: string) { return s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ''); }
function wordsFromLine(text: string) { return text.match(/[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)?/g) ?? []; }
function timestamp(seconds: number) {
  const ms = Math.round(seconds * 1000); const h = Math.floor(ms / 3600000); const m = Math.floor((ms % 3600000) / 60000); const s = Math.floor((ms % 60000) / 1000); const r = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(r).padStart(3, '0')}`;
}
function parseCanonical(raw: string) {
  const lines: { section: string; text: string; tokenStart: number; tokenEnd: number }[] = [];
  const tokens: Token[] = [];
  let section = 'Lyrics';
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim(); if (!line) continue;
    const sectionMatch = line.match(/^\[(.+)]$/); if (sectionMatch) { section = sectionMatch[1]!; continue; }
    const tokenStart = tokens.length;
    const idx = lines.length;
    for (const word of wordsFromLine(line)) tokens.push({ word, norm: norm(word), line: idx });
    lines.push({ section, text: line, tokenStart, tokenEnd: tokens.length });
  }
  return { lines, tokens };
}

const { lines, tokens } = parseCanonical(readFileSync(canonicalPath, 'utf8'));
const whisper = JSON.parse(readFileSync(transcriptPath, 'utf8')) as { segments: Segment[]; word_segments?: Word[] };
const wwords: Word[] = (whisper.word_segments?.length ? whisper.word_segments : whisper.segments.flatMap(s => s.words ?? [])).filter(w => w.start !== undefined && w.end !== undefined);
const wnorm = wwords.map(w => norm(w.word));

const n = tokens.length, m = wwords.length;
const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i]![j] = tokens[i]!.norm === wnorm[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
const match = new Map<number, number>();
let i = 0, j = 0;
while (i < n && j < m) {
  if (tokens[i]!.norm === wnorm[j]) { match.set(i, j); i++; j++; }
  else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++; else j++;
}

const aligned: AlignedLine[] = [];
let interpolatedCount = 0, matchedCount = 0, unmatchedLines = 0;
for (const line of lines) {
  const lineWords = tokens.slice(line.tokenStart, line.tokenEnd);
  const aws: AlignedWord[] = [];
  const notes: string[] = [];
  const matchedLocal = lineWords.map((_, k) => ({ k, wi: match.get(line.tokenStart + k) })).filter(x => x.wi !== undefined) as { k: number; wi: number }[];
  if (!matchedLocal.length) { unmatchedLines++; notes.push('No direct WhisperX word matches; timing interpolated from neighboring matched lyric lines.'); }
  for (let k = 0; k < lineWords.length; k++) {
    const wi = match.get(line.tokenStart + k);
    if (wi !== undefined) {
      const w = wwords[wi]!; aws.push({ word: lineWords[k]!.word, start: w.start!, end: w.end!, source: 'whisperx', confidence: w.score }); matchedCount++; continue;
    }
    const prev = [...match.entries()].filter(([ti]) => ti < line.tokenStart + k).at(-1);
    const next = [...match.entries()].find(([ti]) => ti > line.tokenStart + k);
    const prevT = prev ? wwords[prev[1]]!.end! : 0;
    const nextT = next ? wwords[next[1]]!.start! : prevT + 2;
    const missingBetween = Math.max(1, (next?.[0] ?? line.tokenStart + k + 1) - (prev?.[0] ?? line.tokenStart + k - 1));
    const pos = prev ? line.tokenStart + k - prev[0] : 1;
    const start = Math.min(nextT - 0.08, prevT + ((nextT - prevT) * pos / (missingBetween + 1)));
    const end = Math.max(start + 0.12, Math.min(nextT - 0.03, start + 0.28));
    aws.push({ word: lineWords[k]!.word, start, end, source: 'interpolated' }); interpolatedCount++; notes.push(`Interpolated: ${lineWords[k]!.word}`);
  }
  aws.sort((a, b) => a.start - b.start);
  aligned.push({ section: line.section, text: line.text, start: aws[0]!.start, end: aws.at(-1)!.end, words: aws, notes: notes.length ? [...new Set(notes)] : undefined });
}

mkdirSync(dirname(outJson), { recursive: true });
writeFileSync(outJson, JSON.stringify({ workDir, canonicalPath, transcriptPath, lines: aligned }, null, 2) + '\n');
writeFileSync(outSrt, aligned.map((l, idx) => `${idx + 1}\n${timestamp(l.start)} --> ${timestamp(l.end)}\n${l.text}\n`).join('\n'));
const report: string[] = ['# Transcript alignment report', '', `Work directory: \`${workDir}\``, `Canonical source: \`${canonicalPath}\``, `WhisperX source: \`${transcriptPath}\``, '', `Matched canonical words to WhisperX timings: ${matchedCount}`, `Interpolated/missing canonical words: ${interpolatedCount}`, `Canonical lines with no direct WhisperX word matches: ${unmatchedLines}`, '', '## Lines with notable interpolation', ''];
for (const l of aligned) { const interp = l.words.filter(w => w.source === 'interpolated'); if (interp.length) report.push(`- ${timestamp(l.start)} → ${timestamp(l.end)} — ${l.text}\n  - interpolated: ${interp.map(w => w.word).join(', ')}`); }
report.push('', '## Notes', '', '- Used global sequence alignment against all WhisperX word timings so repeated choruses do not drift past the real vocal ending.', '- Canonical lyrics are treated as text truth; WhisperX provides timing anchors where it recognized words.', '- Interpolated words are approximate and should be reviewed during final captioning.');
writeFileSync(outReport, report.join('\n') + '\n');
console.log(`wrote ${outJson}`); console.log(`wrote ${outSrt}`); console.log(`wrote ${outReport}`);
