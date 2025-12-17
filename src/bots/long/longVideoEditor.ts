import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { optimizeLongScene } from './optimizeLongScene';
import { IGlobalState, IStage } from '../../interfaces/globalState';
import { checkFileExists } from '../../utils/checkFileExists';
import { notifyProgress } from '../../utils/notifyProgress';
import { executeFfmpegCommand } from '../../utils/executeFfmpegCommand';
import { generateCommand } from './generateCommand';
import { generateNarration } from '../generateNarration';
import { generateLongCommandWithNarration } from './generateCommandWithNarration';
import { generateConcatCommandToScenes } from './generateComandToConcatScenes';
import { generateConcatCommandToStages } from './generateComandToConcatStages';
import { extractAudioCommand } from '../../utils/extractAudioCommand';
import { generateTranscription } from '../generateTranscription';
import { generateSubtitle } from './generateSubtitle';
import { burnSubtitleCommand } from './burnSubtitleCommand';
import { getMediaDuration } from '../../utils/getMediaDuration';
import { generateInsertBackgroundMusicCommand } from './generateInsertBackgroundMusicCommand';
import { generateInsertWatermarkCommand } from './generateInsertWaterMarkCommand';

export async function startLongVideoEditing(currentState: IGlobalState) {
  if (!currentState.path_name || !currentState.storyboard) return;

  const alreadyExistsLongVideo = await checkFileExists(
    join(
      process.cwd(),
      'videos',
      'estourouNoticia',
      currentState.path_name,
      'long',
      `${currentState.path_name}.mp4`
    )
  )
  if (alreadyExistsLongVideo) {
    return;
  }

  const projectPath = join(process.cwd(), 'videos', 'estourouNoticia', currentState.path_name, 'long', 'tmp');
  await mkdir(projectPath, { recursive: true });

  const longVideoData = currentState.storyboard.longVideo;
  const stages = Object.entries(longVideoData).filter(([_, item]) => item.sections.length > 0)
  
  let messageId: number
  const { message_id } = await notifyProgress({
    message: `>> Iniciando`,
    setProcessing: true,
  })
  messageId = message_id
  for (let stageIdx = 0; stageIdx < stages.length; stageIdx++) {
    const [stage, data] = stages[stageIdx] as [string, IStage];
    
    const stageName = stage;
    const stageData = data as IStage;
    const concatStageAlreadyExists = await checkFileExists(
      join(
        process.cwd(),
        'videos',
        'estourouNoticia',
        currentState.path_name,
        'long',
        stageName,
        `stage_${stageName}.mp4`
      ))

    if (concatStageAlreadyExists) {
      continue;
    }

    const currentStagePath = join(process.cwd(), 'videos', 'estourouNoticia', currentState.path_name, 'long', stageName, 'tmp');
    await mkdir(currentStagePath, { recursive: true });

    const alreadyExists = await checkFileExists(join(currentStagePath, `stage_${stageName}.mp4`))
    if (!alreadyExists) {
      for (let sectionIdx = 0; sectionIdx < stageData.sections.length; sectionIdx++) {
        const section = stageData.sections[sectionIdx];

        await notifyProgress({
          message: `>> ${stageName.toUpperCase()} - Cena ${sectionIdx + 1} de ${stageData.sections.length}`,
          message_id: messageId
        })

        const sceneAlreadyProduced = await checkFileExists(join(currentStagePath, `scene_${String(sectionIdx).padStart(3, '0')}.mp4`))
        if (!sceneAlreadyProduced) {
          const { scene } = optimizeLongScene(section)
  
          if (scene.speech?.length === 0) {
            const { ffmpegCommand } = generateCommand(scene, stageName, sectionIdx, currentState)
            
            const duration = scene.mainReference?.duration || 0
            await executeFfmpegCommand(
              ffmpegCommand, 
              duration, 
              `>> ${stageName.toUpperCase()} - Cena ${sectionIdx + 1} de ${stageData.sections.length} - Renderizando:`,
              messageId, 
            )
            await notifyProgress({
              message: `>> ${stageName.toUpperCase()} - Cena ${sectionIdx + 1} de ${stageData.sections.length}`,
              message_id: messageId,
            })
          } else if (scene.speech) {
            const narrationAlreadyGenerated = await checkFileExists(join(currentStagePath, `narracao_scene_${sectionIdx}.mp3`))
            if (!narrationAlreadyGenerated) {
              await notifyProgress({
                message: `>> ${stageName.toUpperCase()} - Cena ${sectionIdx + 1} de ${stageData.sections.length} - Gerando narração`,
                message_id: messageId,
              })
              const resultNarration = await generateNarration(scene.speech, currentState, sectionIdx, stageName, 'long')
              if (!resultNarration) {
                throw new Error(`Erro ao gerar narração da ${stageName} - Cena ${sectionIdx + 1}`)
              }
            }
            const { ffmpegCommand, narrationDuration } = await generateLongCommandWithNarration(scene, stageName, sectionIdx, currentState)

            const duration = narrationDuration
            await executeFfmpegCommand(
              ffmpegCommand, 
              duration, 
              `>> ${stageName.toUpperCase()} - Cena ${sectionIdx + 1} de ${stageData.sections.length} - Renderizando:`,
              messageId,
            )
          }
        }
      }
    }
    const { ffmpegCmd, duration } = await generateConcatCommandToScenes(currentState, stageName) 
    await executeFfmpegCommand(
      ffmpegCmd,
      duration,
      `>> ${stageName.toUpperCase()} - Concatenando ${stageData.sections.length} cenas:`,
      messageId,
    )
  }

  const basePath = join(
    process.cwd(),
    'videos',
    'estourouNoticia',
    currentState.path_name,
    'long',
  )
  const existsLongVideoConcat = await checkFileExists(join(basePath, 'tmp', 'long_concatenado.mp4'))
  if (!existsLongVideoConcat) {
    const { ffmpegCmd, duration } = await generateConcatCommandToStages(currentState)
    await executeFfmpegCommand(
      ffmpegCmd,
      duration,
      `>> Concatenando etapas:`,
      messageId,
    )
  }

  let inputPath = join(basePath, 'tmp', 'long_concatenado.mp4')
  let outputPath = join(basePath, 'tmp', 'long_audio_para_transcricao.mp3')
  
  const narrationAlreadyExtracted = await checkFileExists(outputPath)
  if (!narrationAlreadyExtracted) {
    const extractAudioCmd = extractAudioCommand(inputPath, outputPath)
    await executeFfmpegCommand(
      extractAudioCmd,
      0,
      `>> Extraindo áudio:`,
      messageId,
    )
  }

  outputPath = join(basePath, 'tmp', 'long_final_com_legenda.mp4')

  const videoWithSubtitleAlreadyExists = await checkFileExists(outputPath)
  if (!videoWithSubtitleAlreadyExists) {
    await notifyProgress({
      message: `>> Transcrevendo áudio`,
      message_id: messageId,
    })
    const transcription = await generateTranscription(currentState, 'long')
    const duration = transcription.duration || 0
  
    const assPath = join(basePath, 'tmp')
    await generateSubtitle(transcription, assPath)
  
    const burnSubtitleCmd = burnSubtitleCommand(inputPath, outputPath, join(assPath, 'legenda.ass'))
  
    await executeFfmpegCommand(
      burnSubtitleCmd,
      duration,
      `>> Inserindo legendas:`,
      messageId,
    )
  }

  inputPath = outputPath
  outputPath = join(basePath, 'tmp', 'long_com_bgs.mp4')

  const videoWithBgsAlreadyExists = await checkFileExists(outputPath)
  if (!videoWithBgsAlreadyExists) {
    const longVideoDuration = await getMediaDuration(inputPath)
    
    const { ffmpegCmd } = await generateInsertBackgroundMusicCommand(inputPath, outputPath, currentState, longVideoDuration)
    await executeFfmpegCommand(
      ffmpegCmd,
      longVideoDuration,
      `>> Inserindo música de fundo:`,
      messageId,
    )
  }
  
  inputPath = outputPath
  outputPath = join(basePath, `${currentState.path_name}.mp4`)
  
  const videoWithWatermarkAlreadyExists = await checkFileExists(outputPath)
  if (!videoWithWatermarkAlreadyExists) {
    const longVideoDuration = await getMediaDuration(inputPath)
    const watermarkCmd = generateInsertWatermarkCommand(inputPath, outputPath)
    
    await executeFfmpegCommand(
      watermarkCmd,
      longVideoDuration,
      `>> Inserindo Marca d'água:`,
      messageId,
    )
  }

  await notifyProgress({
    message: `>> Vídeo longo concluído! 👍`,
    message_id: messageId,
    setProcessing: false,
  })
}