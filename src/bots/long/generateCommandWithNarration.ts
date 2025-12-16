import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { IGlobalState } from '../../interfaces/globalState';
import { OptimizeLongSceneResponse } from './optimizeLongScene';

const execFileAsync = promisify(execFile);

// === Canvas LONG (16:9) ===
const CANVAS_W = 1920;
const CANVAS_H = 1080;

// Frame FULL
const BIG_FULL_W = 1820;
const BIG_FULL_H = 980;

const BIG_FULL_INNER_W = 1760;
const BIG_FULL_INNER_H = 920;

const BIG_FULL_FG_W = BIG_FULL_INNER_W + 20; // 1780
const BIG_FULL_FG_H = BIG_FULL_INNER_H + 20; // 940

const bigCenterX = 50;
const bigCenterY = 50;

const fullFgX = bigCenterX + Math.floor((BIG_FULL_W - BIG_FULL_FG_W) / 2); // 70
const fullFgY = bigCenterY + Math.floor((BIG_FULL_H - BIG_FULL_FG_H) / 2); // 70

// Small frame (1/3)
const SMALL_W = 590;
const SMALL_H = 465;

// Área interna útil (foreground nítido)
const SMALL_INNER_W = 550;
const SMALL_INNER_H = 425;

// Lower third FULL dentro do frame FULL
const LT_MARGIN_INSIDE = 40;
const LT_FULL_W = 695;
const LT_FULL_H = 114;

const ltFullX = bigCenterX + LT_MARGIN_INSIDE;
const ltFullY = bigCenterY + BIG_FULL_H - LT_FULL_H - LT_MARGIN_INSIDE;

// Lower third SMALL
const LT_SMALL_W = 382;
const LT_SMALL_H = 96;

// Offset extra p/ texto dentro da tarja
const LT_TEXT_EXTRA_OFFSET_X = 80;

// Default imagem
const IMAGE_SLIDE_DEFAULT_DURATION = 4;

// Loop FFmpeg
const LOOP_MAX_SIZE = 32767;

// Pan horizontal (IMAGEM) — editável (igual no curto)
const HORIZONTAL_PAN_RATIO = 0.3; // 0.5 = 50% da sobra
const HORIZONTAL_PAN_OFFSET = (1 - HORIZONTAL_PAN_RATIO) / 2; // centraliza

function q(p: string) {
  return `"${p}"`;
}

function isImageFile(filename?: string) {
  if (!filename) return false;
  return /\.(jpe?g|png|webp|bmp)$/i.test(filename);
}

async function ffprobeDurationSeconds(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    const parsed = parseFloat(String(stdout).trim());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function escapeDrawtext(text: unknown) {
  return String(text ?? '').replace(/'/g, "\\'");
}

function buildEaseExpr(dur: number) {
  const d = Math.max(0.001, dur);
  const dStr = d.toFixed(3);
  // smoothstep: u^2*(3-2u)
  return `(pow(min(1\\,t/${dStr}),2)*(3-2*min(1\\,t/${dStr})))`;
}

/**
 * Pan horizontal para IMAGEM.
 *
 * Correção IMPORTANTÍSSIMA:
 * - Antes eu fazia scale pela altura (scale=-2:targetH). Isso quebra quando a imagem é "estreita"
 *   (ex: vertical 9:16), porque a largura fica menor que targetW e o crop estoura.
 * - Agora eu uso scale=targetW:targetH:force_original_aspect_ratio=increase, garantindo que iw>=targetW e ih>=targetH.
 */
function buildImageHorizontalPan(
  inLabel: string,
  outLabel: string,
  dur: number,
  targetW: number,
  targetH: number,
  fps: number,
) {
  const ease = buildEaseExpr(dur);

  return (
    `${inLabel}setsar=1,` +
    `fps=${fps},` +
    `scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,` +
    `crop=${targetW}:${targetH}:` +
    `x='((iw-${targetW})*${HORIZONTAL_PAN_OFFSET})+((iw-${targetW})*${HORIZONTAL_PAN_RATIO})*${ease}':` +
    `y=0` +
    `${outLabel}`
  );
}

export async function generateLongCommandWithNarration(
  scene: OptimizeLongSceneResponse['scene'],
  stage: string,
  sceneIndex: number,
  currentState: IGlobalState,
) {
  if (!currentState.path_name) throw new Error('Path name not found');
  if (!scene.layout?.layout) {
    throw new Error(`scene.layout.layout missing (sceneIndex=${sceneIndex})`);
  }

  const audioMode = scene.audioMode || 'reference_focus';
  const isVoiceOver = audioMode === 'voice_over_focus';
  if (!isVoiceOver) {
    throw new Error('This generator is only for voice_over_focus (with narration).');
  }

  const globalBase = join(process.cwd(), 'global');
  const referencesBase = join(process.cwd(), 'references', currentState.path_name);

  const layoutName = scene.layout.layout;

  const backgroundPath = join(globalBase, scene.layout.background);
  const bigFramePath = join(
    globalBase,
    scene.layout.bigFrame || 'frame_full_observer_1820x980.png',
  );

  const hasSmallFrame = !!scene.layout.smallFrame;
  const smallFramePath = hasSmallFrame ? join(globalBase, scene.layout.smallFrame!) : '';

  const lowerThirdFullPath = join(globalBase, 'lower_thirds_full.png');
  const lowerThirdSmallPath = join(globalBase, 'lower_thirds_small.png');
  const fontPath = join(globalBase, 'Montserrat-Medium.ttf');

  const outDir = join(
    process.cwd(),
    'videos',
    'estourouNoticia',
    currentState.path_name,
    'long',
    stage,
    'tmp',
  );

  const outFile = join(outDir, `scene_${String(sceneIndex).padStart(3, '0')}.mp4`);
  const narrationPath = join(outDir, `narracao_scene_${sceneIndex}.mp3`);

  const narrationDuration = await ffprobeDurationSeconds(narrationPath);

  // Pose (observer)
  const poseName = scene.pose || 'observer_talking_default.mp4';
  const posePath = join(globalBase, poseName);
  const isPoseVideo = poseName.toLowerCase().endsWith('.mp4');

  // Refs do slide: main + extras
  const mainRef = scene.mainReference;
  const extraRefs = Array.isArray(scene.extraReferences) ? scene.extraReferences : [];
  const slideRefs = [mainRef, ...extraRefs].filter((r) => r && r.name);

  const allSlideImages =
    slideRefs.length > 0 && slideRefs.every((r) => isImageFile(r?.name));

  const imageSlotDuration =
    allSlideImages && narrationDuration > 0 && slideRefs.length > 0
      ? narrationDuration / slideRefs.length
      : null;

  const cmdParts: string[] = ['ffmpeg -y -hide_banner -loglevel error'];
  let nextInputIndex = 0;

  const addInput = (arg: string) => {
    cmdParts.push(arg);
    return nextInputIndex++;
  };

  // Inputs base
  const bgIndex = addInput(`-loop 1 -i ${q(backgroundPath)}`);
  const poseIndex = addInput(
    isPoseVideo ? `-i ${q(posePath)}` : `-loop 1 -i ${q(posePath)}`,
  );
  const bigFrameIndex = addInput(`-loop 1 -i ${q(bigFramePath)}`);

  let smallFrameIndex: number | null = null;
  if (hasSmallFrame) {
    smallFrameIndex = addInput(`-loop 1 -i ${q(smallFramePath)}`);
  }

  const ltSmallIndex = addInput(`-loop 1 -i ${q(lowerThirdSmallPath)}`);

  // Refs do slide viram inputs; guardamos metadados (duration/source/isImage)
  const slideMeta: Array<{
    inputIndex: number;
    duration: number;
    isImage: boolean;
    source: string | null;
  }> = [];

  slideRefs.forEach((ref) => {
    if (!ref?.name) return;

    const file = ref.name;
    const path = join(referencesBase, file);
    const isImg = isImageFile(file);

    let baseDur = 0;
    if (isImg) {
      if (imageSlotDuration) baseDur = imageSlotDuration;
      else if (ref.duration && ref.duration > 0) baseDur = ref.duration;
      else baseDur = IMAGE_SLIDE_DEFAULT_DURATION;
    } else {
      baseDur = ref.duration && ref.duration > 0 ? ref.duration : 0;
    }

    const hasDur = baseDur > 0;

    const idxIn = addInput(
      isImg && hasDur
        ? `-loop 1 -t ${baseDur.toFixed(3)} -i ${q(path)}`
        : isImg
          ? `-loop 1 -i ${q(path)}`
          : `-i ${q(path)}`,
    );

    if (hasDur) {
      slideMeta.push({
        inputIndex: idxIn,
        duration: baseDur,
        isImage: isImg,
        source: (ref as any)?.source ? String((ref as any).source) : null,
      });
    }
  });

  // Narração
  const narrationIndex = addInput(`-i ${q(narrationPath)}`);

  // =================================================================================
  // === CASO ESPECIAL: referencia_fullscreen COM NARRAÇÃO
  // =================================================================================
  if (layoutName === 'referencia_fullscreen' && slideMeta.length) {
    // pega a primeira fonte existente
    let refSource: string | null = null;
    for (const m of slideMeta) {
      if (m.source) {
        refSource = m.source;
        break;
      }
    }
    if (!refSource && mainRef && (mainRef as any).source) {
      refSource = String((mainRef as any).source);
    }

    const hasSource = !!refSource;
    const sourceText = hasSource ? escapeDrawtext(refSource) : '';

    let ltFullIndex: number | null = null;
    if (hasSource) {
      ltFullIndex = addInput(`-loop 1 -i ${q(lowerThirdFullPath)}`);
    }

    let filter = '';

    // Base
    filter += `[${bgIndex}:v]scale=${CANVAS_W}:${CANVAS_H}[bg];`;

    // Preparar refs: IMAGEM = pan horizontal; VÍDEO = scale/crop
    slideMeta.forEach((meta, i) => {
      const inIdx = meta.inputIndex;

      if (meta.isImage) {
        const dur = meta.duration || IMAGE_SLIDE_DEFAULT_DURATION;
        filter +=
          buildImageHorizontalPan(
            `[${inIdx}:v]`,
            `[fref_${i}]`,
            dur,
            BIG_FULL_FG_W,
            BIG_FULL_FG_H,
            25,
          ) + ';';
      } else {
        filter +=
          `[${inIdx}:v]scale=${BIG_FULL_FG_W}:${BIG_FULL_FG_H}:force_original_aspect_ratio=increase,` +
          `crop=${BIG_FULL_FG_W}:${BIG_FULL_FG_H},setsar=1[fref_${i}];`;
      }
    });

    // Concat sequência
    const fLabels = slideMeta.map((_, i) => `[fref_${i}]`).join('');
    filter += `${fLabels}concat=n=${slideMeta.length}:v=1:a=0[refSeq];`;

    // Loop infinito
    filter += `[refSeq]loop=loop=-1:size=${LOOP_MAX_SIZE}:start=0[refLoop];`;

    // Overlay dentro do frame FULL
    filter +=
      `[bg][refLoop]overlay=${fullFgX}:${fullFgY}[s1];` +
      `[s1][${bigFrameIndex}:v]overlay=${bigCenterX}:${bigCenterY}[base_full];`;

    // Créditos FULL fixos durante a narração
    if (hasSource && ltFullIndex !== null) {
      filter +=
        `[base_full][${ltFullIndex}:v]overlay=${ltFullX}:${ltFullY}[lt_base_full];` +
        `[lt_base_full]drawtext=fontfile='${fontPath}':text='Créditos:':` +
        `x=${ltFullX + 20 + LT_TEXT_EXTRA_OFFSET_X}:y=${ltFullY + 19}:fontsize=22:fontcolor=black[lt1_full];` +
        `[lt1_full]drawtext=fontfile='${fontPath}':text='${sourceText}':` +
        `x=${ltFullX + 30 + LT_TEXT_EXTRA_OFFSET_X}:y=${ltFullY + 65}:fontsize=20:fontcolor=black[video];`;
    } else {
      filter += `[base_full]copy[video];`;
    }

    cmdParts.push(`-filter_complex "${filter}"`);

    cmdParts.push(
      '-map "[video]"',
      `-map ${narrationIndex}:a`,
      '-c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p',
      '-c:a aac',
      '-shortest',
      q(outFile),
    );

    return { ffmpegCommand: cmdParts.join(' '), outputPath: outFile, narrationDuration };
  }

  // =================================================================================
  // === CASO: sem refs válidas OU sem smallFrame (fallback)
  // =================================================================================
  if (!slideMeta.length || smallFrameIndex === null) {
    const filter =
      `[${bgIndex}:v]scale=${CANVAS_W}:${CANVAS_H}[bg];` +
      `[${poseIndex}:v]scale=${BIG_FULL_FG_W}:${BIG_FULL_FG_H}:force_original_aspect_ratio=increase,` +
      `crop=${BIG_FULL_FG_W}:${BIG_FULL_FG_H}[pose_fg];` +
      `[bg][pose_fg]overlay=${fullFgX}:${fullFgY}[b1];` +
      `[b1][${bigFrameIndex}:v]overlay=${bigCenterX}:${bigCenterY}[video]`;

    cmdParts.push(`-filter_complex "${filter}"`);
    cmdParts.push(
      '-map "[video]"',
      `-map ${narrationIndex}:a`,
      '-c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p',
      '-c:a aac',
      '-shortest',
      q(outFile),
    );

    return { ffmpegCommand: cmdParts.join(' '), outputPath: outFile, narrationDuration };
  }

  // =================================================================================
  // === CASO PADRÃO: pose no bigFrame + slideshow no smallFrame + LT SMALL por segmento
  // =================================================================================

  // janelas por segmento
  const durations = slideMeta.map((s) => s.duration);
  const totalSpan = durations.reduce((acc, d) => acc + d, 0);

  const segmentStarts: number[] = [];
  const segmentEnds: number[] = [];

  let accDur = 0;
  for (let i = 0; i < durations.length; i++) {
    segmentStarts[i] = accDur;
    accDur += durations[i];
    segmentEnds[i] = accDur;
  }

  // posição do smallFrame dentro do bigFrame
  let sfX: number;
  let sfY: number;

  if (layoutName === 'observador_full_left_empty') {
    sfX = bigCenterX + 5;
    sfY = bigCenterY + 5;
  } else if (layoutName === 'observador_full_right_empty') {
    sfX = bigCenterX + BIG_FULL_W - SMALL_W - 2;
    sfY = bigCenterY + 5;
  } else {
    sfX = bigCenterX + 5;
    sfY = bigCenterY + 5;
  }

  // LT SMALL dentro do smallFrame
  const ltSmallX = sfX + 20;
  const ltSmallY = sfY + SMALL_H - LT_SMALL_H - 20;

  const creditX = ltSmallX + LT_TEXT_EXTRA_OFFSET_X;
  const creditY = ltSmallY + 16;

  const sourceX = ltSmallX + LT_TEXT_EXTRA_OFFSET_X + 10;
  const sourceY = ltSmallY + 50;

  let filter = '';

  // Base
  filter += `[${bgIndex}:v]scale=${CANVAS_W}:${CANVAS_H}[bg];`;

  // Pose no bigFrame
  filter +=
    `[${poseIndex}:v]scale=${BIG_FULL_FG_W}:${BIG_FULL_FG_H}:force_original_aspect_ratio=increase,` +
    `crop=${BIG_FULL_FG_W}:${BIG_FULL_FG_H}[pose_fg];` +
    `[bg][pose_fg]overlay=${fullFgX}:${fullFgY}[b1];` +
    `[b1][${bigFrameIndex}:v]overlay=${bigCenterX}:${bigCenterY}[bigReady];`;

  // Preparar refs p/ smallFrame:
  // - BG blur (sempre)
  // - FG: IMAGEM = pan horizontal (com scale increase + crop seguro)
  //       VÍDEO = crop central normal
  slideMeta.forEach((meta, i) => {
    const inIdx = meta.inputIndex;

    filter +=
      `[${inIdx}:v]scale=${SMALL_W}:${SMALL_H}:force_original_aspect_ratio=increase,` +
      `boxblur=40:1,crop=${SMALL_W}:${SMALL_H}[sbg_${i}];`;

    if (meta.isImage) {
      const dur = meta.duration || IMAGE_SLIDE_DEFAULT_DURATION;
      filter +=
        buildImageHorizontalPan(
          `[${inIdx}:v]`,
          `[sfg_${i}]`,
          dur,
          SMALL_INNER_W,
          SMALL_INNER_H,
          25,
        ) + ';';
    } else {
      filter +=
        `[${inIdx}:v]scale=-1:${SMALL_INNER_H}:force_original_aspect_ratio=increase,` +
        `crop=${SMALL_INNER_W}:${SMALL_INNER_H}:(in_w-${SMALL_INNER_W})/2:(in_h-${SMALL_INNER_H})/2[sfg_${i}];`;
    }

    filter +=
      `[sbg_${i}][sfg_${i}]overlay=(W-w)/2:(H-h)/2[tmp_s_${i}];` +
      `[tmp_s_${i}]setsar=1[sref_${i}];`;
  });

  // Concat + loop
  const srefLabels = slideMeta.map((_, i) => `[sref_${i}]`).join('');
  filter += `${srefLabels}concat=n=${slideMeta.length}:v=1:a=0[refSmallSeq];`;
  filter += `[refSmallSeq]loop=loop=-1:size=${LOOP_MAX_SIZE}:start=0[refSmallLoop];`;

  // Overlay do smallFrame + moldura small
  filter +=
    `[bigReady][refSmallLoop]overlay=${sfX}:${sfY}[s1];` +
    `[s1][${smallFrameIndex}:v]overlay=${sfX}:${sfY}[s2];`;

  // LT SMALL por segmento com mod(t,totalSpan)
  let currentLabel = 's2';

  slideMeta.forEach((meta, i) => {
    if (!meta.source) return;

    const safeSrc = escapeDrawtext(meta.source);
    const start = segmentStarts[i];
    const end = segmentEnds[i];

    const enable = `between(mod(t\\,${totalSpan.toFixed(3)})\\,${start.toFixed(3)}\\,${end.toFixed(3)})`;

    const ltLabel = `slt_${i}`;
    const ltcLabel = `sltc_${i}`;
    const outLabel = `ls_${i}`;

    filter +=
      `[${currentLabel}][${ltSmallIndex}:v]overlay=` +
      `x=${ltSmallX}:y=${ltSmallY}:enable='${enable}'[${ltLabel}];` +
      `[${ltLabel}]drawtext=fontfile='${fontPath}':text='Créditos:':` +
      `x=${creditX}:y=${creditY}:fontsize=18:fontcolor=black:enable='${enable}'[${ltcLabel}];` +
      `[${ltcLabel}]drawtext=fontfile='${fontPath}':text='${safeSrc}':` +
      `x=${sourceX}:y=${sourceY}:fontsize=20:fontcolor=black:enable='${enable}'[${outLabel}];`;

    currentLabel = outLabel;
  });

  filter += `[${currentLabel}]copy[video];`;

  cmdParts.push(`-filter_complex "${filter}"`);

  cmdParts.push(
    '-map "[video]"',
    `-map ${narrationIndex}:a`,
    '-c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p',
    '-c:a aac',
    '-shortest',
    q(outFile),
  );

  return { ffmpegCommand: cmdParts.join(' '), outputPath: outFile, narrationDuration };
}
