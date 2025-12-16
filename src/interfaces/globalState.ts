export interface IStage {
  sections: {
    id: string
    layout: string
    pose?: string
    speech?: string
    audioMode: string
    references: {
      name: string
      slot: string
      priority: string
      kind: string
      keepAudio: boolean
      relevantAudio: boolean
      duration: number
      description?: string
      croped: boolean
    }[]
  }[]
}

interface IVideo {
  introducao: IStage
  apresentacaoDoProblema: IStage
  explicacao: IStage
  desfecho: IStage
  finalOpinativo: IStage
}

export interface IStoryboard {
  social_title: string
  shortVideo: IVideo
  longVideo: IVideo
  descricaoYoutube: string
  descricaoToktok: string
  tags: string
  hasThumbnailHorizontal: boolean
  hasThumbnailVertical: boolean
}

interface IBackgroundSoundTrack {
  short?: {
    name: string;
    duration: number;
    path: string;
  }[];
  long?: {
    name: string;
    duration: number;
    path: string;
  }[];
}

export interface IGlobalState {
  message_id?: number
  path_name?: string
  title?: string
  storyboard?: IStoryboard
  voice_id: string
  g_googledrive_dir: string
  selectedMusic?: IBackgroundSoundTrack
}
