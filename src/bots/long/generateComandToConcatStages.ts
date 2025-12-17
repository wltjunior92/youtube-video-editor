import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { IGlobalState } from "../../interfaces/globalState";

const execFileAsync = promisify(execFile);

async function ffprobeDurationSeconds(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    const parsed = parseFloat(String(stdout).trim());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

type StageInfo = {
  stage: 'introducao' | 'apresentacaoDoProblema' | 'explicacao' | 'desfecho' | 'finalOpinativo';
  name: string;
  duration: number;
  path: string
};

async function listStages(currentState: IGlobalState) {
  if (!currentState.path_name) throw new Error("Path name not found");

  // Ordem narrativa fixa (equivalente ao n8n)
  const stagesList = [
    "introducao",
    "apresentacaoDoProblema",
    "explicacao",
    "desfecho",
    "finalOpinativo",
  ] as const;

  const existentStages = await Promise.all(
    stagesList.map(async (stage) => {
      const outDir = join(
        process.cwd(),
        "videos",
        "estourouNoticia",
        currentState.path_name!,
        "long",
        stage,
      );

      try {
        const files = await readdir(outDir);
        const stageFileName = `stage_${stage}.mp4`;

        if (!files.includes(stageFileName)) return null;

        const fullPath = join(outDir, stageFileName);
        const duration = await ffprobeDurationSeconds(fullPath);

        return { stage, name: stageFileName, duration, path: fullPath } satisfies StageInfo;
      } catch {
        return null;
      }
    }),
  );

  return existentStages.filter((item): item is StageInfo => item !== null);
}

export async function generateConcatCommandToStages(currentState: IGlobalState) {
  if (!currentState.path_name) throw new Error("Path name not found");

  const baseLongDir = join(
    process.cwd(),
    "videos",
    "estourouNoticia",
    currentState.path_name,
    "long",
  );

  const output = join(baseLongDir, "tmp", "long_concatenado.mp4");

  const stages = await listStages(currentState);

  if (stages.length === 0) {
    throw new Error("Nenhum estágio encontrado para concatenação.");
  }

  // Monta clips na ordem narrativa fixa
  const clips = stages.map((s) => ({
    file: s.path,
    duration: s.duration,
  }));

  // Caso simples: 1 etapa só (recodifica/copia pro final geral)
  if (clips.length === 1) {
    const inputFile = clips[0].file;

    const ffmpegCmd =
      `ffmpeg -y -i "${inputFile}" ` +
      `-c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p ` +
      `-c:a aac "${output}"`;

    return {
      ffmpegCmd,
      output,
      duration: clips[0].duration,
    };
  }

  // ====== MONTAGEM DO COMANDO FFMPEG COM CROSSFADES (igual ao n8n) ======

  // 1) Inputs
  const inputParts = clips.map((c) => `-i "${c.file}"`);

  // 2) FILTER_COMPLEX com normalização + xfade/acrossfade
  const filterParts: string[] = [];

  // Normaliza PTS de cada etapa: [i:v] -> [v0], [i:a] -> [a0], etc. (igual n8n)
  clips.forEach((_, idx) => {
    filterParts.push(
      `[${idx}:v]setpts=PTS-STARTPTS[v${idx}]`,
      `[${idx}:a]asetpts=PTS-STARTPTS[a${idx}]`,
    );
  });

  // Crossfade de 0.2s
  const cross = 0.2;

  // Duração total aproximada (soma - sobreposições)
  const totalDuration =
    clips.reduce((acc, c) => acc + (c.duration || 0), 0) - (clips.length - 1) * cross;

  // offset inicial: duração do primeiro clipe - crossfade
  let offset = (clips[0].duration || 0) - cross;
  if (offset < 0) offset = 0;

  let vPrev = "v0";
  let aPrev = "a0";

  for (let i = 1; i < clips.length; i++) {
    const vNext = `v_mix_${i}`;
    const aNext = `a_mix_${i}`;

    filterParts.push(
      `[${vPrev}][v${i}]xfade=transition=fade:duration=${cross}:offset=${offset.toFixed(
        3,
      )}[${vNext}]`,
      `[${aPrev}][a${i}]acrossfade=d=${cross}[${aNext}]`,
    );

    vPrev = vNext;
    aPrev = aNext;

    // Atualiza offset (blindado contra durações 0)
    const clipDurSafe = Math.max(clips[i].duration || 0, cross);
    offset += clipDurSafe - cross;
    if (offset < 0) offset = 0;
  }

  const finalVideoLabel = vPrev;
  const finalAudioLabel = aPrev;

  // String final do filter_complex
  const filterComplex = `"${filterParts.join(";")}"`;

  const ffmpegCmd =
    `ffmpeg -y ${inputParts.join(" ")} ` +
    `-filter_complex ${filterComplex} ` +
    `-map "[${finalVideoLabel}]" -map "[${finalAudioLabel}]" ` +
    `-c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p ` +
    `-c:a aac "${output}"`;

  return {
    ffmpegCmd,
    output,
    duration: totalDuration,
  };
}
