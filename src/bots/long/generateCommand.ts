import { join } from "node:path";
import { IGlobalState } from "../../interfaces/globalState";
import { OptimizeLongSceneResponse } from "./optimizeLongScene";

const LOOP_MAX_SIZE = 32767;

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

const BLUR_FULL_W = BIG_FULL_W - 20; // 1800
const BLUR_FULL_H = BIG_FULL_H - 20; // 960

const bigCenterX = 50;
const bigCenterY = 50;

const fullFgX = bigCenterX + Math.floor((BIG_FULL_W - BIG_FULL_FG_W) / 2); // 70
const fullFgY = bigCenterY + Math.floor((BIG_FULL_H - BIG_FULL_FG_H) / 2); // 70

const blurFullX = bigCenterX + 10; // 60
const blurFullY = bigCenterY + 10; // 60

// Frame MEDIUM (pointing layouts)
const FRAME_MED_W = 1180;
const FRAME_MED_H = 980;

const BLUR_MED_W = FRAME_MED_W - 10; // 1170
const BLUR_MED_H = FRAME_MED_H - 10; // 970

const BIG_MED_INNER_W = 1120;
const BIG_MED_INNER_H = 920;

// Small frame lateral (1/3)
const SMALL_W = 590;
const SMALL_H = 465;

const SMALL_BLUR_W = SMALL_W - 20; // margem 10px
const SMALL_BLUR_H = SMALL_H - 20;
const SMALL_FG_W = SMALL_W - 40; // margem 20px
const SMALL_FG_H = SMALL_H - 40;

// Posições (medium + small)
const bigLeftX = 50;
const bigRightX = CANVAS_W - 50 - FRAME_MED_W; // 690
const bigMedY = 50;

const smallRightX = CANVAS_W - 50 - SMALL_W; // 1280
const smallLeftX = 50;
const smallTopY = 50;
const smallBottomY = CANVAS_H - 50 - SMALL_H; // 565

// Lower third
const LT_MARGIN_INSIDE = 40;
const LT_W = 695;
const LT_H = 114;
const ltFullX = bigCenterX + LT_MARGIN_INSIDE;
const ltFullY = bigCenterY + BIG_FULL_H - LT_H - LT_MARGIN_INSIDE;
const LT_TEXT_EXTRA_OFFSET_X = 80;

// Duração default de imagem (sem narração)
const IMAGE_SLIDE_DEFAULT_DURATION = 4;

function q(p: string) {
  return `"${p}"`;
}

function escapeDrawtext(text: unknown) {
  return String(text ?? '').replace(/'/g, "\\'");
}

function isImageFile(filename?: string) {
  if (!filename) return false;
  return /\.(jpe?g|png|webp|bmp)$/i.test(filename);
}

type Scene = OptimizeLongSceneResponse['scene'];

// Essa função espelha o node do n8n: "Criar cenas LONG sem narração"
export function generateCommand(
  scene: Scene,
  stage: string,
  sceneIndex: number,
  currentState: IGlobalState
) {
  if (!currentState.path_name) throw new Error('Path name not found');
  if (!scene.mainReference?.name) {
    throw new Error(`scene.mainReference is missing (sceneIndex=${sceneIndex})`);
  }
  if (!scene.layout?.layout) {
    throw new Error(`scene.layout.layout is missing (sceneIndex=${sceneIndex})`);
  }

  const globalBase = join(process.cwd(), 'global');
  const localPath = join(process.cwd(), 'videos', 'estourouNoticia', currentState.path_name);

  const referencesBase = join(process.cwd(), "references", currentState.path_name);

  // Saída
  const outDir = join(localPath, 'long', stage, 'tmp');
  const outFile = join(outDir, `scene_${String(sceneIndex).padStart(3, '0')}.mp4`);

  // Layout assets
  const layoutName = scene.layout.layout;
  const backgroundPath = join(globalBase, scene.layout.background);
  const bigFramePath = join(globalBase, scene.layout.bigFrame || 'frame_full_observer_1820x980.png');
  const hasSmallFrame = !!scene.layout.smallFrame;
  const smallFramePath = hasSmallFrame ? join(globalBase, scene.layout.smallFrame!) : '';

  // Referência principal
  const mainRef = scene.mainReference;
  const mainRefPath = join(referencesBase, mainRef.name);
  const mainIsImage = isImageFile(mainRef.name);

  const mainRefDuration =
    mainRef.duration && mainRef.duration > 0
      ? mainRef.duration
      : mainIsImage
        ? IMAGE_SLIDE_DEFAULT_DURATION
        : 0;

  const duration = mainRefDuration;
  const durationStr = duration.toFixed(3);

  // Fonte jornalística (no n8n: mainRef.source)
  const hasSource = !!(mainRef as any).source;
  const sourceText = hasSource ? escapeDrawtext((mainRef as any).source) : '';

  // Pose
  const poseName = scene.pose || '';
  const posePath = poseName ? join(globalBase, poseName) : '';
  const isPoseVideo = !!poseName && poseName.toLowerCase().endsWith('.mp4');

  // n8n usava "focus"; aqui mapeia do seu "audioMode"
  const focus = scene.audioMode === 'reference_focus' ? 'reference_focus' : 'voice_over_focus';

  // Extras
  const extraRefs = Array.isArray(scene.extraReferences) ? scene.extraReferences : [];

  // Lower third FULL (vídeo longo)
  const lowerThirdFullPath = join(globalBase, 'lower_thirds_full.png');
  const fontPath = join(globalBase, 'Montserrat-Medium.ttf');

  const wantsLowerThirdForLayout =
    ['referencia_fullscreen',
      'referencia_full_with_observer_pointing_left_and_extra',
      'referencia_full_with_observer_pointing_right_and_extra',
    ].includes(layoutName) && hasSource;

  // ============ Inputs dinâmicos (igual n8n) ============
  const cmdParts: string[] = ['ffmpeg -y'];
  let nextInputIndex = 0;
  const addInput = (arg: string) => {
    cmdParts.push(arg);
    return nextInputIndex++;
  };

  const bgIndex = addInput(`-loop 1 -i ${q(backgroundPath)}`);

  const mainRefIndex = addInput(
    mainIsImage ? `-loop 1 -i ${q(mainRefPath)}` : `-i ${q(mainRefPath)}`
  );

  let poseIndex: number | null = null;
  if (posePath) {
    poseIndex = addInput(isPoseVideo ? `-i ${q(posePath)}` : `-loop 1 -i ${q(posePath)}`);
  }

  const bigFrameIndex = addInput(`-loop 1 -i ${q(bigFramePath)}`);

  let smallFrameIndex: number | null = null;
  if (hasSmallFrame) {
    smallFrameIndex = addInput(`-loop 1 -i ${q(smallFramePath)}`);
  }

  let lowerThirdIndex: number | null = null;
  if (wantsLowerThirdForLayout) {
    lowerThirdIndex = addInput(`-loop 1 -i ${q(lowerThirdFullPath)}`);
  }

  // Extras: input separado, e guardamos metadados (duração, idx)
  const extrasMeta: Array<{ inputIndex: number; duration: number; isImage: boolean }> = [];
  for (let i = 0; i < extraRefs.length; i++) {
    const er = extraRefs[i];
    if (!er?.name) continue;

    const erPath = join(referencesBase, er.name);
    const erIsImage = isImageFile(er.name);

    const idxIn = addInput(
      erIsImage ? `-loop 1 -i ${q(erPath)}` : `-stream_loop -1 -i ${q(erPath)}`
    );

    const baseDur =
      er.duration && er.duration > 0
        ? er.duration
        : erIsImage
          ? IMAGE_SLIDE_DEFAULT_DURATION
          : 0;

    if (baseDur > 0) {
      extrasMeta.push({ inputIndex: idxIn, duration: baseDur, isImage: erIsImage });
    }
  }

  // ============ Filter complex ============
  let filter = `[${bgIndex}:v]scale=${CANVAS_W}:${CANVAS_H}[bg];`;

  // Helper: lower third com texto deslocado 80px
  const buildLowerThirdBlock = (inputLabel: string, outputLabel: string, ltX: number, ltY: number) => {
    if (!wantsLowerThirdForLayout || lowerThirdIndex === null) {
      return `[${inputLabel}]copy[${outputLabel}]`;
    }

    return (
      `[${inputLabel}][${lowerThirdIndex}:v]overlay=` +
      `${ltX}:${ltY}:eof_action=pass:enable='lte(t,${durationStr})'[lt_base];` +
      `[lt_base]drawtext=fontfile='${fontPath}':text='Créditos':` +
      `x=${ltX + 20 + LT_TEXT_EXTRA_OFFSET_X}:y=${ltY + 19}:fontsize=20:fontcolor=black:` +
      `enable='lte(t,${durationStr})'[lt1];` +
      `[lt1]drawtext=fontfile='${fontPath}':text='${sourceText}':` +
      `x=${ltX + 30 + LT_TEXT_EXTRA_OFFSET_X}:y=${ltY + 65}:fontsize=24:fontcolor=black:` +
      `enable='lte(t,${durationStr})'[${outputLabel}]`
    );
  };

  // ================ LAYOUTS ================

  // 1) referencia_fullscreen (ou observador_full_clean em reference_focus)
  if (
    layoutName === 'referencia_fullscreen' ||
    (layoutName === 'observador_full_clean' && focus === 'reference_focus')
  ) {
    filter +=
      `[${mainRefIndex}:v]split[ref_a][ref_b];` +
      `[ref_a]scale=${BLUR_FULL_W}:${BLUR_FULL_H},boxblur=40:1[ref_bg];` +
      `[ref_b]scale=${BIG_FULL_FG_W}:${BIG_FULL_FG_H}:force_original_aspect_ratio=increase,` +
      `crop=${BIG_FULL_FG_W}:${BIG_FULL_FG_H}[ref_fg];` +
      `[bg][ref_bg]overlay=${blurFullX}:${blurFullY}:eof_action=pass[step1];` +
      `[step1][ref_fg]overlay=${fullFgX}:${fullFgY}:eof_action=pass[step2];` +
      `[step2][${bigFrameIndex}:v]overlay=${bigCenterX}:${bigCenterY}:eof_action=pass[base_vid];` +
      buildLowerThirdBlock("base_vid", "video", ltFullX, ltFullY);

    // 2) observador_full_clean em voice_over_focus (usa pose)
  } else if (layoutName === 'observador_full_clean' && focus !== 'reference_focus' && poseIndex !== null) {
    filter +=
      `[${poseIndex}:v]scale=${BIG_FULL_FG_W}:${BIG_FULL_FG_H}:force_original_aspect_ratio=increase,` +
      `crop=${BIG_FULL_FG_W}:${BIG_FULL_FG_H}[pose_fg];` +
      `[bg][pose_fg]overlay=${fullFgX}:${fullFgY}:eof_action=pass[step1];` +
      `[step1][${bigFrameIndex}:v]overlay=${bigCenterX}:${bigCenterY}:eof_action=pass[video]`;

    // 3) observador_full_left_empty (pose + small de ref)
  } else if (layoutName === 'observador_full_left_empty' && poseIndex !== null && smallFrameIndex !== null) {
    const sfX = bigCenterX + BIG_FULL_W - SMALL_W - 50;
    const sfY = bigCenterY + 50;

    filter +=
      `[${poseIndex}:v]scale=${BIG_FULL_FG_W}:${BIG_FULL_FG_H}:force_original_aspect_ratio=increase,` +
      `crop=${BIG_FULL_FG_W}:${BIG_FULL_FG_H}[pose_fg];` +
      `[bg][pose_fg]overlay=${fullFgX}:${fullFgY}:eof_action=pass[step1];` +
      `[step1][${bigFrameIndex}:v]overlay=${bigCenterX}:${bigCenterY}:eof_action=pass[step2];` +
      `[${mainRefIndex}:v]scale=${SMALL_W}:${SMALL_H}:force_original_aspect_ratio=decrease[ref_small];` +
      `[step2][ref_small]overlay=${sfX}:${sfY}:eof_action=pass[step3];` +
      `[step3][${smallFrameIndex}:v]overlay=${sfX}:${sfY}:eof_action=pass[video]`;

    // 4) observador_full_right_empty (pose + small de ref)
  } else if (layoutName === 'observador_full_right_empty' && poseIndex !== null && smallFrameIndex !== null) {
    const sfX = bigCenterX + 50;
    const sfY = bigCenterY + 50;

    filter +=
      `[${poseIndex}:v]scale=${BIG_FULL_FG_W}:${BIG_FULL_FG_H}:force_original_aspect_ratio=increase,` +
      `crop=${BIG_FULL_FG_W}:${BIG_FULL_FG_H}[pose_fg];` +
      `[bg][pose_fg]overlay=${fullFgX}:${fullFgY}:eof_action=pass[step1];` +
      `[step1][${bigFrameIndex}:v]overlay=${bigCenterX}:${bigCenterY}:eof_action=pass[step2];` +
      `[${mainRefIndex}:v]scale=${SMALL_W}:${SMALL_H}:force_original_aspect_ratio=decrease[ref_small];` +
      `[step2][ref_small]overlay=${sfX}:${sfY}:eof_action=pass[step3];` +
      `[step3][${smallFrameIndex}:v]overlay=${sfX}:${sfY}:eof_action=pass[video]`;

    // 5) pointing_left + extras
  } else if (layoutName === 'referencia_full_with_observer_pointing_left_and_extra' && poseIndex !== null && smallFrameIndex !== null) {
    const bigX = bigLeftX;
    const bigY = bigMedY;
    const smallX = smallRightX;
    const topY = smallTopY;
    const bottomY = smallBottomY;

    const ltMedX = bigX + LT_MARGIN_INSIDE;
    const ltMedY = bigY + FRAME_MED_H - LT_H - LT_MARGIN_INSIDE;

    // Big frame medium (main ref)
    filter +=
      `[${mainRefIndex}:v]split[rm_a][rm_b];` +
      `[rm_a]scale=${BLUR_MED_W}:${BLUR_MED_H}:force_original_aspect_ratio=increase,boxblur=40:1,` +
      `crop=${BLUR_MED_W}:${BLUR_MED_H}[ref_med_bg];` +
      `[rm_b]scale=${BIG_MED_INNER_W}:${BIG_MED_INNER_H}:force_original_aspect_ratio=increase,` +
      `crop=${BIG_MED_INNER_W}:${BIG_MED_INNER_H}[ref_med_fg];` +
      `[bg][ref_med_bg]overlay=${bigX + 5}:${bigY + 5}:eof_action=pass[rm_step1];` +
      `[rm_step1][ref_med_fg]overlay=${bigX}+(${FRAME_MED_W}-w)/2:${bigY}+(${FRAME_MED_H}-h)/2:eof_action=pass[step1];` +
      `[step1][${bigFrameIndex}:v]overlay=${bigX}:${bigY}:eof_action=pass[step2];`;

    // Small top (pose)
    filter +=
      `[${poseIndex}:v]split[pose_a][pose_b];` +
      `[pose_a]scale=${SMALL_BLUR_W}:${SMALL_BLUR_H}:force_original_aspect_ratio=increase,boxblur=40:1,` +
      `crop=${SMALL_BLUR_W}:${SMALL_BLUR_H}[pose_bg];` +
      `[pose_b]scale=${SMALL_FG_W}:${SMALL_FG_H}:force_original_aspect_ratio=increase,` +
      `crop=${SMALL_FG_W}:${SMALL_FG_H}[pose_fg_small];` +
      `[step2][pose_bg]overlay=${smallX + 10}:${topY + 10}:eof_action=pass[step2_pose];` +
      `[step2_pose][pose_fg_small]overlay=${smallX + 20}:${topY + 20}:eof_action=pass[step3];` +
      `[step3][${smallFrameIndex}:v]overlay=${smallX}:${topY}:eof_action=pass[step4];` +
      buildLowerThirdBlock("step4", "base_lt", ltMedX, ltMedY);

    // Small bottom (extras)
    if (extrasMeta.length === 0) {
      filter += `;[base_lt][${smallFrameIndex}:v]overlay=${smallX}:${bottomY}:eof_action=pass[video]`;
    } else {
      filter += ";";

      extrasMeta.forEach((e, i) => {
        const segDur = e.duration || IMAGE_SLIDE_DEFAULT_DURATION;
        const segDurStr = segDur.toFixed(3);

        const bgLabel = `ex_bg_${i}`;
        const fgLabel = `ex_fg_${i}`;
        const bgOut = `ex_bg_f_${i}`;
        const fgOut = `ex_fg_f_${i}`;
        const patchLbl = `ex_patch_${i}`;
        const segLbl = `ex_seg_${i}`;

        filter +=
          `[${e.inputIndex}:v]split[${bgLabel}][${fgLabel}];` +
          `[${bgLabel}]scale=${SMALL_BLUR_W}:${SMALL_BLUR_H}:force_original_aspect_ratio=increase,boxblur=40:1,` +
          `crop=${SMALL_BLUR_W}:${SMALL_BLUR_H}[${bgOut}];` +
          `[${fgLabel}]scale=${SMALL_FG_W}:${SMALL_FG_H}:force_original_aspect_ratio=increase,` +
          `crop=${SMALL_FG_W}:${SMALL_FG_H}[${fgOut}];` +
          `[${bgOut}][${fgOut}]overlay=10:10:eof_action=pass[${patchLbl}];` +
          `[${patchLbl}]trim=0:${segDurStr},setpts=PTS-STARTPTS,setsar=1[${segLbl}];`;
      });

      const seqInputs = extrasMeta.map((_, i) => `[ex_seg_${i}]`).join('');
      filter +=
        `${seqInputs}concat=n=${extrasMeta.length}:v=1:a=0[exSeq];` +
        `[exSeq]loop=loop=-1:size=${LOOP_MAX_SIZE}:start=0[exLoop];` +
        `[base_lt][exLoop]overlay=${smallX + 10}:${bottomY + 10}:eof_action=pass[with_extras];` +
        `[with_extras][${smallFrameIndex}:v]overlay=${smallX}:${bottomY}:eof_action=pass[video]`;
    }

    // 6) pointing_right + extras
  } else if (layoutName === 'referencia_full_with_observer_pointing_right_and_extra' && poseIndex !== null && smallFrameIndex !== null) {
    const bigX = bigRightX;
    const bigY = bigMedY;
    const smallX = smallLeftX;
    const topY = smallTopY;
    const bottomY = smallBottomY;

    const ltMedX = bigX + LT_MARGIN_INSIDE;
    const ltMedY = bigY + FRAME_MED_H - LT_H - LT_MARGIN_INSIDE;

    // Big frame medium (main ref)
    filter +=
      `[${mainRefIndex}:v]split[rm2_a][rm2_b];` +
      `[rm2_a]scale=${BLUR_MED_W}:${BLUR_MED_H}:force_original_aspect_ratio=increase,boxblur=40:1,` +
      `crop=${BLUR_MED_W}:${BLUR_MED_H}[ref_med_bg2];` +
      `[rm2_b]scale=${BIG_MED_INNER_W}:${BIG_MED_INNER_H}:force_original_aspect_ratio=increase,` +
      `crop=${BIG_MED_INNER_W}:${BIG_MED_INNER_H}[ref_med_fg2];` +
      `[bg][ref_med_bg2]overlay=${bigX + 5}:${bigY + 5}:eof_action=pass[rm2_step1];` +
      `[rm2_step1][ref_med_fg2]overlay=${bigX}+(${FRAME_MED_W}-w)/2:${bigY}+(${FRAME_MED_H}-h)/2:eof_action=pass[step1];` +
      `[step1][${bigFrameIndex}:v]overlay=${bigX}:${bigY}:eof_action=pass[step2];`;

    // Small top (pose)
    filter +=
      `[${poseIndex}:v]split[pose2_a][pose2_b];` +
      `[pose2_a]scale=${SMALL_BLUR_W}:${SMALL_BLUR_H}:force_original_aspect_ratio=increase,boxblur=40:1,` +
      `crop=${SMALL_BLUR_W}:${SMALL_BLUR_H}[pose2_bg];` +
      `[pose2_b]scale=${SMALL_FG_W}:${SMALL_FG_H}:force_original_aspect_ratio=increase,` +
      `crop=${SMALL_FG_W}:${SMALL_FG_H}[pose2_fg_small];` +
      `[step2][pose2_bg]overlay=${smallX + 10}:${topY + 10}:eof_action=pass[step2_pose2];` +
      `[step2_pose2][pose2_fg_small]overlay=${smallX + 20}:${topY + 20}:eof_action=pass[step3];` +
      `[step3][${smallFrameIndex}:v]overlay=${smallX}:${topY}:eof_action=pass[step4];` +
      buildLowerThirdBlock("step4", "base_lt2", ltMedX, ltMedY);

    // Small bottom (extras)
    if (extrasMeta.length === 0) {
      filter += `;[base_lt2][${smallFrameIndex}:v]overlay=${smallX}:${bottomY}:eof_action=pass[video]`;
    } else {
      filter += ";";

      extrasMeta.forEach((e, i) => {
        const segDur = e.duration || IMAGE_SLIDE_DEFAULT_DURATION;
        const segDurStr = segDur.toFixed(3);

        const bgLabel = `ex2_bg_${i}`;
        const fgLabel = `ex2_fg_${i}`;
        const bgOut = `ex2_bg_f_${i}`;
        const fgOut = `ex2_fg_f_${i}`;
        const patchLbl = `ex2_patch_${i}`;
        const segLbl = `ex2_seg_${i}`;

        filter +=
          `[${e.inputIndex}:v]split[${bgLabel}][${fgLabel}];` +
          `[${bgLabel}]scale=${SMALL_BLUR_W}:${SMALL_BLUR_H}:force_original_aspect_ratio=increase,boxblur=40:1,` +
          `crop=${SMALL_BLUR_W}:${SMALL_BLUR_H}[${bgOut}];` +
          `[${fgLabel}]scale=${SMALL_FG_W}:${SMALL_FG_H}:force_original_aspect_ratio=increase,` +
          `crop=${SMALL_FG_W}:${SMALL_FG_H}[${fgOut}];` +
          `[${bgOut}][${fgOut}]overlay=10:10:eof_action=pass[${patchLbl}];` +
          `[${patchLbl}]trim=0:${segDurStr},setpts=PTS-STARTPTS,setsar=1[${segLbl}];`;
      });

      const seqInputs = extrasMeta.map((_, i) => `[ex2_seg_${i}]`).join('');
      filter +=
        `${seqInputs}concat=n=${extrasMeta.length}:v=1:a=0[ex2Seq];` +
        `[ex2Seq]loop=loop=-1:size=${LOOP_MAX_SIZE}:start=0[ex2Loop];` +
        `[base_lt2][ex2Loop]overlay=${smallX + 10}:${bottomY + 10}:eof_action=pass[with_extras2];` +
        `[with_extras2][${smallFrameIndex}:v]overlay=${smallX}:${bottomY}:eof_action=pass[video]`;
    }

    // Fallback: referencia_fullscreen (mesmo bloco do 1)
  } else {
    filter +=
      `[${mainRefIndex}:v]split[rf_a][rf_b];` +
      `[rf_a]scale=${BLUR_FULL_W}:${BLUR_FULL_H},boxblur=40:1[rf_bg];` +
      `[rf_b]scale=${BIG_FULL_FG_W}:${BIG_FULL_FG_H}:force_original_aspect_ratio=increase,` +
      `crop=${BIG_FULL_FG_W}:${BIG_FULL_FG_H}[rf_fg];` +
      `[bg][rf_bg]overlay=${blurFullX}:${blurFullY}:eof_action=pass[rf_step1];` +
      `[rf_step1][rf_fg]overlay=${fullFgX}:${fullFgY}:eof_action=pass[rf_step2];` +
      `[rf_step2][${bigFrameIndex}:v]overlay=${bigCenterX}:${bigCenterY}:eof_action=pass[base_vid];` +
      buildLowerThirdBlock("base_vid", "video", ltFullX, ltFullY);
  }

  cmdParts.push(`-filter_complex "${filter}"`);

  // Áudio: sem narração → áudio da referência principal (se houver)
  cmdParts.push(
    '-map "[video]"',
    `-map ${mainRefIndex}:a?`,
    "-c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p",
    "-c:a aac"
  );

  if (duration > 0) cmdParts.push(`-t ${durationStr}`);

  cmdParts.push('-shortest', q(outFile));

  return { ffmpegCommand: cmdParts.join(' '), outputPath: outFile };
}
