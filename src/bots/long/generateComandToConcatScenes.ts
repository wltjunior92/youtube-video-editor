import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { IGlobalState } from '../../interfaces/globalState';

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

export async function listScenes(currentState: IGlobalState, stage: string) {
  if (!currentState.path_name) throw new Error('Path name not found');

  const outDir = join(
    process.cwd(),
    "videos",
    "estourouNoticia",
    currentState.path_name,
    "long",
    stage,
    "tmp"
  );

  const files = await readdir(outDir);
  const sceneFiles = files.filter((f) => /^scene_.*\.mp4$/.test(f));

  const scenes = await Promise.all(
    sceneFiles.map(async (name) => {
      const duration = await ffprobeDurationSeconds(join(outDir, name));
      return { name, duration };
    })
  );

  return scenes.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export async function generateConcatCommandToScenes(
  currentState: IGlobalState,
  stage: string,
) {
  if (!currentState.path_name) throw new Error("Path name not found");

  // Diretório onde estão as cenas (tmp da etapa)
  const baseDir = join(
    process.cwd(),
    "videos",
    "estourouNoticia",
    currentState.path_name,
    "long",
    stage,
    "tmp",
  );

  // Diretório final da etapa
  const outputDir = join(
    process.cwd(),
    "videos",
    "estourouNoticia",
    currentState.path_name,
    "long",
    stage,
  );

  const scenes = await listScenes(currentState, stage);

  if (scenes.length === 0) {
    throw new Error(`Nenhuma cena encontrada em: ${baseDir}`);
  }

  const clips = scenes.map((s) => ({
    file: s.name,
    duration: s.duration,
  }));

  const output = join(outputDir, `stage_${stage}.mp4`);

  // Caso simples: 1 cena só (só recodifica/normaliza)
  if (clips.length === 1) {
    const inputFile = join(baseDir, clips[0].file);

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

  // Monta inputs do ffmpeg
  const inputParts = clips.map((c) => `-i "${join(baseDir, c.file)}"`);

  // ====== FILTER_COMPLEX COM CROSSFADE ======
  const TARGET_FPS = "30000/1001"; // 29.97
  const TARGET_SR = 44100;
  const cross = 0.2;

  const totalDuration = clips.reduce((acc, c) => acc + c.duration, 0) - (clips.length - 1) * cross;

  const filterParts: string[] = [];

  // 1) Normaliza PTS de cada vídeo/áudio
  clips.forEach((_, idx) => {
    filterParts.push(
      `[${idx}:v]fps=${TARGET_FPS},settb=AVTB,setpts=PTS-STARTPTS[v${idx}]`,
      `[${idx}:a]aresample=${TARGET_SR},aformat=channel_layouts=stereo,asetpts=PTS-STARTPTS[a${idx}]`,
    );
  });

  // 2) Encadeia xfade/acrossfade
  let vPrev = "v0";
  let aPrev = "a0";

  // offset inicial
  let offset = (clips[0].duration || 0) - cross;
  if (offset < 0) offset = 0;

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

    // Atualiza offset
    offset += (clips[i].duration || 0) - cross;
    if (offset < 0) offset = 0;
  }

  const finalVideoLabel = vPrev;
  const finalAudioLabel = aPrev;

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