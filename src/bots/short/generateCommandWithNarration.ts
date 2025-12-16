import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { IGlobalState } from "../../interfaces/globalState";
import { OptimizeShortSceneResponse } from "./optimizeShortScene";

const execFileAsync = promisify(execFile);

const W = 1080;
const FULL_H = 1920;

const OBS_HEIGHT = 640;

// Blur somente para VÍDEO
const BLUR = "boxblur=40:1";

// Pan horizontal (IMAGEM) — editável
const HORIZONTAL_PAN_RATIO = 0.3; // 0.5 = 50% da sobra
const HORIZONTAL_PAN_OFFSET = (1 - HORIZONTAL_PAN_RATIO) / 2; // centraliza

function escapeDrawtext(text: unknown) {
  return String(text ?? "").replace(/'/g, "\\'");
}

function q(p: string) {
  return `"${p}"`;
}

function isImageFile(name?: string) {
  return !!name && /\.(png|jpe?g|webp)$/i.test(name);
}

function isVideoFile(name?: string) {
  return !!name && /\.(mp4|mov|mkv|m4v)$/i.test(name);
}

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

function buildEaseExpr(dur: number) {
  const d = Math.max(0.001, dur);
  const dStr = d.toFixed(3);
  return `(pow(min(1\\,t/${dStr}),2)*(3-2*min(1\\,t/${dStr})))`;
}

/**
 * IMAGEM: scale pela altura 1920 (mantém AR), crop 1080x1920 com pan horizontal suave.
 */
function buildImagePanFilter(inputLabel: string, outLabel: string, dur: number) {
  const ease = buildEaseExpr(dur);
  return (
    `${inputLabel}setsar=1,fps=30,` +
    `scale=-2:${FULL_H}:force_original_aspect_ratio=increase,` +
    `crop=${W}:${FULL_H}:` +
    `x='((iw-${W})*${HORIZONTAL_PAN_OFFSET})+((iw-${W})*${HORIZONTAL_PAN_RATIO})*${ease}':` +
    `y=0` +
    `${outLabel}`
  );
}

/**
 * VÍDEO: bg blur + fg centralizado.
 */
function buildVideoBlurComposite(
  inputLabel: string,
  bgLabel: string,
  fgLabel: string,
  tmpLabel: string,
  outLabel: string,
  targetW: number,
  targetH: number
) {
  return (
    `${inputLabel}scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,` +
    `${BLUR},crop=${targetW}:${targetH}${bgLabel};` +
    `${inputLabel}scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease${fgLabel};` +
    `${bgLabel}${fgLabel}overlay=(W-w)/2:(H-h)/2${tmpLabel};` +
    `${tmpLabel}setsar=1${outLabel}`
  );
}

/**
 * Gera comando para cena com NARRAÇÃO (voice_over_focus).
 * - Faz ffprobe do mp3 da narração aqui dentro.
 */
export async function generateCommandWithNarration(
  scene: OptimizeShortSceneResponse["scene"],
  stage: string,
  sceneIndex: number,
  currentState: IGlobalState
) {
  if (!scene.mainReference?.name) {
    throw new Error(`scene.mainReference is missing (sceneIndex=${sceneIndex})`);
  }
  if (!currentState.path_name) {
    throw new Error("Path name not found");
  }

  const globalBase = join(process.cwd(), "global");
  const localReferencesBase = join(process.cwd(), "references", currentState.path_name);

  const fontPath = join(globalBase, "Montserrat-Medium.ttf");
  const lowerThirdPath = join(globalBase, "lower_thirds_small.png");

  const outDir = join(
    process.cwd(),
    "videos",
    "estourouNoticia",
    currentState.path_name,
    "short",
    stage,
    "tmp"
  );
  const outFile = join(outDir, `scene_${String(sceneIndex).padStart(3, "0")}.mp4`);

  const dividerPathRaw = scene.layout?.divider ?? null;
  const hasDivider = !!dividerPathRaw;
  const isFullscreen = !hasDivider;

  const poseFile = scene.pose ?? "observer_reading_phone.mp4";
  const posePath = join(globalBase, poseFile);

  const narrationPath = join(
    process.cwd(),
    "videos",
    "estourouNoticia",
    currentState.path_name,
    "short",
    stage,
    "tmp",
    `narracao_scene_${sceneIndex}.mp3`
  );

  const extraRefs = Array.isArray(scene.extraReferences) ? scene.extraReferences : [];
  const refsToUse = [scene.mainReference, ...extraRefs].filter(Boolean);

  const narrationDuration = await ffprobeDurationSeconds(narrationPath);

  const allImages = refsToUse.length > 0 && refsToUse.every((r) => isImageFile(r?.name));
  const perRefDur =
    allImages && narrationDuration > 0 ? narrationDuration / refsToUse.length : 0;

  const refDurations = refsToUse.map((r) => {
    const d = Number(r?.duration || 0);
    if (allImages && narrationDuration > 0) return perRefDur;
    return d > 0 ? d : 0;
  });

  const refSources = refsToUse.map((r: any) => (r?.source ? String(r.source) : ""));
  const anyRefHasSource = refSources.some(Boolean);

  const inputs: string[] = ["ffmpeg -y"];

  refsToUse.forEach((ref, i) => {
    const refPath = join(localReferencesBase, ref.name);
    const isImg = isImageFile(ref.name);
    const d = refDurations[i] || 0;

    if (isImg) {
      if (d > 0) inputs.push(`-loop 1 -t ${d.toFixed(3)} -i ${q(refPath)}`);
      else inputs.push(`-loop 1 -i ${q(refPath)}`);
    } else {
      inputs.push(`-i ${q(refPath)}`);
    }
  });

  const refCount = refsToUse.length;
  let nextIndex = refCount;

  const poseIndex = nextIndex++;
  if (isVideoFile(poseFile)) inputs.push(`-i ${q(posePath)}`);
  else inputs.push(`-loop 1 -i ${q(posePath)}`);

  const dividerIndex = hasDivider ? nextIndex++ : null;
  if (hasDivider && dividerPathRaw) inputs.push(`-loop 1 -i ${q(dividerPathRaw)}`);

  const lowerThirdIndex = anyRefHasSource ? nextIndex++ : null;
  if (anyRefHasSource) inputs.push(`-loop 1 -i ${q(lowerThirdPath)}`);

  const narrationIndex = nextIndex++;
  inputs.push(`-i ${q(narrationPath)}`);

  let filter = "";

  refsToUse.forEach((ref, i) => {
    const inLabel = `[${i}:v]`;
    const outLabel = `[ref_${i}]`;

    if (isImageFile(ref.name)) {
      const dur = refDurations[i] || (allImages && narrationDuration > 0 ? perRefDur : 4);
      filter += buildImagePanFilter(inLabel, outLabel, dur) + ";";
    } else {
      // vídeo: blur bg + fg centralizado (1080x1920)
      filter +=
        buildVideoBlurComposite(
          inLabel,
          `[ref_bg_${i}]`,
          `[ref_fg_${i}]`,
          `[tmp_ref_${i}]`,
          outLabel,
          W,
          FULL_H
        ) + ";";
    }
  });

  const concatInputs = refsToUse.map((_, i) => `[ref_${i}]`).join("");
  filter += `${concatInputs}concat=n=${refCount}:v=1:a=0[ref_bottom];`;

  if (!isFullscreen) {
    filter +=
      `[${poseIndex}:v]scale=${W}:${OBS_HEIGHT}:force_original_aspect_ratio=increase,` +
      `${BLUR},crop=${W}:${OBS_HEIGHT}[obs_bg];` +
      `[${poseIndex}:v]scale=${W}:${OBS_HEIGHT}:force_original_aspect_ratio=decrease[obs_fg];` +
      `[obs_bg][obs_fg]overlay=(W-w)/2:(H-h)/2[obs_top];`;
  }

  if (isFullscreen) {
    filter += `color=size=${W}x${FULL_H}:color=black[base];` + `[base][ref_bottom]overlay=0:0[base3];`;
  } else {
    filter +=
      `color=size=${W}x${FULL_H}:color=black[base];` +
      `[base][obs_top]overlay=0:0[base2];` +
      `[base2][ref_bottom]overlay=0:${OBS_HEIGHT}[base3];`;

    if (hasDivider && dividerIndex !== null) {
      filter += `[base3][${dividerIndex}:v]overlay=(W-w)/2:${OBS_HEIGHT}[base_div];`;
    } else {
      filter += `[base3]null[base_div];`;
    }
  }

  let currentLabel = isFullscreen ? "base3" : "base_div";

  if (anyRefHasSource && lowerThirdIndex !== null) {
    let acc = 0;
    for (let i = 0; i < refCount; i++) {
      const src = refSources[i];
      const dur = refDurations[i] || 0;
      const start = acc;
      acc += dur;
      const end = acc;

      if (!src || dur <= 0) continue;

      const safeSrc = escapeDrawtext(src);
      const enable = `between(t,${start.toFixed(3)},${end.toFixed(3)})`;

      const lt = `lt_${i}`;
      const lt2 = `lt2_${i}`;
      const out = `out_${i}`;

      filter +=
        `[${currentLabel}][${lowerThirdIndex}:v]overlay=40:630:enable='${enable}'[${lt}];` +
        `[${lt}]drawtext=fontfile='${fontPath}':text='Crédito:':x=120:y=644:fontsize=18:fontcolor=black:enable='${enable}'[${lt2}];` +
        `[${lt2}]drawtext=fontfile='${fontPath}':text='${safeSrc}':x=130:y=682:fontsize=20:fontcolor=black:enable='${enable}'[${out}];`;

      currentLabel = out;
    }
  }

  filter += `[${currentLabel}]null[video]`;

  const cmdParts: string[] = [...inputs];

  cmdParts.push(
    `-filter_complex "${filter}"`,
    `-map "[video]"`,
    `-map ${narrationIndex}:a`,
    "-c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p",
    "-c:a aac",
    "-shortest"
  );

  if (allImages && narrationDuration > 0) {
    cmdParts.push(`-t ${narrationDuration.toFixed(3)}`);
  }

  cmdParts.push(q(outFile));

  return {
    ffmpegCommand: cmdParts.join(" "),
    outputPath: outFile,
    narrationDuration,
  };
}
