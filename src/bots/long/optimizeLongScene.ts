import { IStage } from '../../interfaces/globalState';

export interface OptimizeLongSceneResponse {
  scene: {
    layout: {
      layout: string;
      background: 'background.png';
      bigFrame?: string;
      smallFrame?: string;
    };
    pose: string;
    speech?: string;
    audioMode: string;
    mainReference?: {
      name: string;
      slot: string;
      priority: string;
      kind: string;
      keepAudio: boolean;
      relevantAudio: boolean;
      duration: number;
      description?: string;
      croped: boolean;
    };
    extraReferences: {
      name: string;
      slot: string;
      priority: string;
      kind: string;
      keepAudio: boolean;
      relevantAudio: boolean;
      duration: number;
      description?: string;
      croped: boolean;
    }[];
  };
}

export function optimizeLongScene(
  section: IStage['sections'][number]
): OptimizeLongSceneResponse {
  const layout = section.layout;

  // Replica o layoutAssets do n8n
  let layoutAssets: OptimizeLongSceneResponse['scene']['layout'] = {
    layout,
    background: 'background.png',
  };

  switch (layout) {
    case 'observador_full_clean':
      layoutAssets = {
        ...layoutAssets,
        bigFrame: 'frame_full_observer_1820x980.png',
      };
      break;

    case 'observador_full_left_empty':
      layoutAssets = {
        ...layoutAssets,
        bigFrame: 'frame_full_observer_1820x980.png',
        smallFrame: 'frame_small_side_590x465.png',
      };
      break;

    case 'observador_full_right_empty':
      layoutAssets = {
        ...layoutAssets,
        bigFrame: 'frame_full_observer_1820x980.png',
        smallFrame: 'frame_small_side_590x465.png',
      };
      break;

    case 'referencia_fullscreen':
      layoutAssets = {
        ...layoutAssets,
        bigFrame: 'frame_full_observer_1820x980.png',
      };
      break;

    case 'referencia_full_with_observer_pointing_left_and_extra':
      layoutAssets = {
        ...layoutAssets,
        bigFrame: 'frame_medium_reference_1180x980.png',
        smallFrame: 'frame_small_side_590x465.png',
      };
      break;

    case 'referencia_full_with_observer_pointing_right_and_extra':
      layoutAssets = {
        ...layoutAssets,
        bigFrame: 'frame_medium_reference_1180x980.png',
        smallFrame: 'frame_small_side_590x465.png',
      };
      break;

    default:
      layoutAssets = {
        ...layoutAssets,
        bigFrame: 'frame_full_observer_1820x980.png',
      };
      break;
  }

  const pose = section.pose;

  let poseAsset: string;
  switch (pose) {
    case 'observer_talking_default':
      poseAsset = 'observer_talking_default.mp4';
      break;
    case 'observer_point_left':
      poseAsset = 'observer_point_left.png';
      break;
    case 'observer_point_right':
      poseAsset = 'observer_point_right.png';
      break;
    case 'observer_surprised':
      poseAsset = 'observer_surprised.png';
      break;
    case 'observer_reading_phone':
      poseAsset = 'observer_reading_phone.mp4';
      break;
    default:
      poseAsset = 'observer_talking_default.mp4';
      break;
  }

  const speech = section.speech ?? '';

  const audioMode = speech.length !== 0 ? 'voice_over_focus' : 'reference_focus';

  const mainReference = section.references.find((item) => item.slot === 'main');
  const extraReferences = section.references.filter((item) => item.slot !== 'main');

  return {
    scene: {
      layout: layoutAssets,
      pose: poseAsset,
      speech,
      audioMode,
      mainReference,
      extraReferences,
    },
  };
}
