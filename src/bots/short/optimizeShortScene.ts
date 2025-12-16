import { join } from 'node:path';
import { IStage } from '../../interfaces/globalState';

export interface OptimizeShortSceneResponse {
  scene: {
    layout: {
      divider?: string;
    };
    pose?: string;
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
  }
}

export function optimizeShortScene(section: IStage['sections'][number]): OptimizeShortSceneResponse {
  const layout = section.layout
  let layoutAssets
  if (layout === 'referencia_fullscreen') {
    layoutAssets = {}
  } else {
    layoutAssets = {
      divider: join(process.cwd(), 'global', 'divider_horizontal_1080.png')
    }
  }

  const pose = section.pose
  let poseAsset
  switch (pose) {
    // case 'observer_talking_default':
    //   poseAsset = 'observer_talking_default.mp4'
    //   break;
    case 'observer_reading_phone':
      poseAsset = 'observer_reading_phone.mp4'
      break;
    default:
      poseAsset = 'observer_talking_default.mp4'
      break;
  }

  const speech = section.speech

  const audioMode = speech?.length !== 0 ? "voice_over_focus" : 'reference_focus'

  const mainReference = section.references.find(item => item.slot === 'main')
  const extraReferences = section.references.filter(item => item.slot !== 'main')

  return {
    scene: {
      layout: layoutAssets,
      pose: poseAsset,
      speech,
      audioMode,
      mainReference,
      extraReferences,
    }
  }
}