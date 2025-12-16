import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function generateSubtitle(
  groqData: any,
  outputDir: string,
) {
  const CFG = {
    playResX: 1080,
    playResY: 1920,
    fontName: 'Montserrat ExtraBold',
    fontSize: 86,
    outline: 8,
    alignment: 2, // centro inferior
    marginV: 500,
    windowSize: 4,
    maxCharsPerBlock: 20,
    minDurSec: 0.06,
    offsetSec: 0.0,
  };

  // ===================== utils =====================
  const EPS = 0.0005;
  const punctRe = /^[,.:;!?…]+$/;

  function toTimeCS(csInt: number) {
    if (!Number.isFinite(csInt) || csInt < 0) csInt = 0;
    csInt = Math.round(csInt);
    const cs = csInt % 100;
    const totalSec = Math.floor(csInt / 100);
    const s = totalSec % 60;
    const m = Math.floor(totalSec / 60) % 60;
    const h = Math.floor(totalSec / 3600);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  }

  function escapeAssText(t: string) {
    return t
      .replace(/\\/g, '\\\\')
      .replace(/{/g, '\\{')
      .replace(/}/g, '\\}')
      .replace(/\r?\n/g, ' ');
  }

  function header() {
    const primaryActiveRed = '&H005200FF';
    const secondaryInactive = '&H00F7E6E7';
    const outlineColour = '&H001E1E1F';
    const backColour = '&H00000000';

    return `[Script Info]
Title: karaoke
ScriptType: v4.00+
PlayResX: ${CFG.playResX}
PlayResY: ${CFG.playResY}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${CFG.fontName},${CFG.fontSize},${primaryActiveRed},${secondaryInactive},${outlineColour},${backColour},-1,0,0,0,100,100,0,0,1,${CFG.outline},0,${CFG.alignment},30,30,${CFG.marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;
  }

  // ===================== 1) Flatten =====================
  let flat: any[] = [];

  if (Array.isArray(groqData.words) && groqData.words.length) {
    flat = groqData.words.map((w: any, idx: number) => ({
      word: String(w.word).trim(),
      start: Number(w.start),
      end: Number(w.end),
      _idx: idx,
      _seg: 0,
    }));
  }

  if (!flat.length) {
    throw new Error('groqData.words[] é obrigatório para gerar legenda.');
  }

  flat = flat.filter(
    (w) => w.word && Number.isFinite(w.start) && Number.isFinite(w.end),
  );

  // junta pontuação
  const merged: any[] = [];
  for (const w of flat) {
    if (punctRe.test(w.word) && merged.length) {
      merged[merged.length - 1].word += w.word;
    } else {
      merged.push({ ...w });
    }
  }

  // ordena
  merged.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return a._idx - b._idx;
  });

  // monotonicidade
  for (let i = 1; i < merged.length; i++) {
    if (merged[i].start < merged[i - 1].end - EPS) {
      merged[i].start = merged[i - 1].end + EPS;
    }
    if (merged[i].end < merged[i].start + EPS) {
      merged[i].end = merged[i].start + EPS;
    }
  }

  const words = merged;

  // ===================== 2) Reescala =====================
  const durFinal = Number(groqData.duration);
  if (!Number.isFinite(durFinal) || durFinal <= 0) {
    throw new Error('groqData.duration inválido.');
  }

  const lastEnd = words[words.length - 1].end;
  const scale = durFinal / lastEnd;

  for (const w of words) {
    const s = scale * w.start;
    const e = scale * w.end;
    w.startCS = Math.round(s * 100);
    w.endCS = Math.max(w.startCS + 1, Math.round(e * 100));
  }

  // ===================== 3) Blocos =====================
  const lines: string[] = [];
  const minDurCS = Math.round(CFG.minDurSec * 100);

  function blockChars(slice: any[]) {
    return slice.reduce((acc, w) => acc + w.word.length, 0);
  }

  let i = 0;
  while (i < words.length) {
    let k = Math.min(CFG.windowSize, words.length - i);
    let slice = words.slice(i, i + k);

    while (k > 1 && blockChars(slice) > CFG.maxCharsPerBlock) {
      k--;
      slice = words.slice(i, i + k);
    }

    const first = slice[0];
    const last = slice[slice.length - 1];

    const startCS = first.startCS;
    const endCS = Math.max(last.endCS, startCS + minDurCS);

    const parts = slice.map((w: any) => {
      const dur = Math.max(minDurCS, w.endCS - w.startCS);
      return `{\\k${dur}}${escapeAssText(w.word)}`;
    });

    lines.push(
      `Dialogue: 0,${toTimeCS(startCS)},${toTimeCS(endCS)},Default,,0,0,0,,${parts.join(' ')}`,
    );

    i += k;
  }

  // ===================== 4) Salva arquivo =====================
  const assContent = `${header()}\n${lines.join('\n')}`;
  const outPath = join(outputDir, 'legenda.ass');

  await writeFile(outPath, assContent, 'utf-8');
}
