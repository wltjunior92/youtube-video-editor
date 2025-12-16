import { join } from "node:path";
import { IGlobalState } from "../../interfaces/globalState";
import { OptimizeShortSceneResponse } from "./optimizeShortScene";

const FG_WIDTH = 1200;
const OBS_HEIGHT = 640;
const REF_HEIGHT = 1280;

const FULL_H = 1920;
const W = 1080;

const ZOOM_GAIN = 0.03;

function escapeDrawtext(text: unknown) {
  return String(text ?? '').replace(/'/g, "\\'");
}

function q(p: string) {
  return `"${p}"`;
}

export function generateCommand(
  scene: OptimizeShortSceneResponse['scene'],
  stage: string,
  sceneIndex: number,
  currentState: IGlobalState
) {
  if (!scene.mainReference?.name) {
    throw new Error(`scene.mainReference is missing (sceneIndex=${sceneIndex})`);
  }

  if (!currentState.path_name) {
    throw new Error('Path name not found');
  }
  const globalBase = join(process.cwd(), 'global');
  const localReferencesBase = join(process.cwd(), 'references', currentState.path_name);

  const fontPath = join(globalBase, 'Montserrat-Medium.ttf');
  const lowerThirdPath = join(globalBase, 'lower_thirds_small.png');

  const outDir = join(
    process.cwd(),
    'videos',
    'estourouNoticia',
    currentState.path_name,
    'short',
    stage,
    'tmp',
  );

  const outFile = join(
    outDir,
    `scene_${String(sceneIndex).padStart(3, '0')}.mp4`,
  );

  const mainRef = scene.mainReference;
  const mainRefPath = join(localReferencesBase, mainRef.name);

  const isVideoRef = mainRef.kind === 'video';
  const duration = mainRef.duration || 0;
  const durationStr = duration.toFixed(3);

  const hasSource = !!(mainRef as any).source;
  const sourceText = hasSource ? escapeDrawtext((mainRef as any).source) : '';

  const dividerPath = scene.layout?.divider ?? null;
  const hasDivider = !!dividerPath;

  const isFullscreen = !hasDivider;

  const poseFile = scene.pose ?? 'observer_reading_phone.mp4';
  const posePath = join(globalBase, poseFile);

  const poseIndex = 0;
  const refIndex = 1;
  const dividerIndex = hasDivider ? 2 : null;
  const lowerThirdIndex = hasSource ? (hasDivider ? 3 : 2) : null;

  let filter = '';

  if (isFullscreen) {
    // ========================
    // Fullscreen (sem observer)
    // ========================
    filter +=
      `[${refIndex}:v]scale=${W}:${FULL_H}:force_original_aspect_ratio=increase,` +
      `boxblur=40:1,` +
      `crop=${W}:${FULL_H}[bg];`;

    if (isVideoRef) {
      filter += `[${refIndex}:v]scale=${FG_WIDTH}:-2:force_original_aspect_ratio=decrease[fg];`;
    } else {
      const baseDur = duration > 0 ? duration : 5;
      filter +=
        `[${refIndex}:v]scale=${FG_WIDTH}:-2:force_original_aspect_ratio=decrease,` +
        `zoompan=` +
        `z='1+${ZOOM_GAIN}*on/${baseDur}':` +
        `x='trunc(iw/2-(iw/zoom/2))':` +
        `y='trunc(ih/2-(ih/zoom/2))':` +
        `d=1[fg];`;
    }

    filter += `[bg][fg]overlay=(W-w)/2:(H-h)/2[base];`;

    if (hasSource && lowerThirdIndex !== null) {
      filter +=
        `[base][${lowerThirdIndex}:v]overlay=40:630:enable='lte(t,${durationStr})'[lt];` +
        `[lt]drawtext=fontfile='${fontPath}':text='Crédito:':x=120:y=644:fontsize=18:fontcolor=black:enable='lte(t,${durationStr})'[lt2];` +
        `[lt2]drawtext=fontfile='${fontPath}':text='${sourceText}':x=130:y=682:fontsize=20:fontcolor=black:enable='lte(t,${durationStr})'[video];`;
    } else {
      filter += `[base]null[video];`;
    }
  } else {
    // ========================
    // Layout com Observer + Referência
    // ========================
    filter +=
      `[${refIndex}:v]scale=${W}:${REF_HEIGHT}:force_original_aspect_ratio=increase,` +
      `boxblur=40:1,` +
      `crop=${W}:${REF_HEIGHT}[ref_bg];`;

    if (isVideoRef) {
      filter += `[${refIndex}:v]scale=${FG_WIDTH}:-2:force_original_aspect_ratio=decrease[ref_fg];`;
    } else {
      const baseDur = duration > 0 ? duration : 5;
      filter +=
        `[${refIndex}:v]scale=${FG_WIDTH}:-2:force_original_aspect_ratio=decrease,` +
        `zoompan=` +
        `z='1+${ZOOM_GAIN}*on/${baseDur}':` +
        `x='trunc(iw/2-(iw/zoom/2))':` +
        `y='trunc(ih/2-(ih/zoom/2))':` +
        `d=1[ref_fg];`;
    }

    filter += `[ref_bg][ref_fg]overlay=(W-w)/2:(H-h)/2[ref_final];`;

    filter +=
      `[${poseIndex}:v]scale=${W}:${OBS_HEIGHT}:force_original_aspect_ratio=increase,` +
      `boxblur=40:1,` +
      `crop=${W}:${OBS_HEIGHT}[obs_bg];` +
      `[${poseIndex}:v]scale=${W}:${OBS_HEIGHT}:force_original_aspect_ratio=decrease[obs_fg];` +
      `[obs_bg][obs_fg]overlay=(W-w)/2:(H-h)/2[observer];`;

    filter +=
      `color=size=${W}x${FULL_H}:color=black[base];` +
      `[base][observer]overlay=0:0[tmp1];` +
      `[tmp1][ref_final]overlay=0:${OBS_HEIGHT}[base2];`;

    if (hasDivider && dividerIndex !== null) {
      filter += `[base2][${dividerIndex}:v]overlay=(W-w)/2:${OBS_HEIGHT}[base3];`;
    } else {
      filter += `[base2]null[base3];`;
    }

    if (hasSource && lowerThirdIndex !== null) {
      filter +=
        `[base3][${lowerThirdIndex}:v]overlay=40:630:enable='lte(t,${durationStr})'[lt];` +
        `[lt]drawtext=fontfile='${fontPath}':text='Crédito:':x=120:y=644:fontsize=18:fontcolor=black:enable='lte(t,${durationStr})'[lt2];` +
        `[lt2]drawtext=fontfile='${fontPath}':text='${sourceText}':x=130:y=682:fontsize=20:fontcolor=black:enable='lte(t,${durationStr})'[video];`;
    } else {
      filter += `[base3]null[video];`;
    }
  }

  const cmdParts: string[] = [
    'ffmpeg -y',
    `-i ${q(posePath)}`,
    `-i ${q(mainRefPath)}`,
  ];

  if (hasDivider && dividerPath) cmdParts.push(`-loop 1 -i ${q(dividerPath)}`);
  if (hasSource) cmdParts.push(`-loop 1 -i ${q(lowerThirdPath)}`);

  cmdParts.push(
    `-filter_complex "${filter}"`,
    '-map "[video]"',
    `-map ${refIndex}:a?`,
    '-c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p',
    '-c:a aac',
    '-shortest',
  );

  if (duration > 0) cmdParts.push(`-t ${durationStr}`);
  cmdParts.push(q(outFile));

  return { ffmpegCommand: cmdParts.join(' '), outputPath: outFile };
}