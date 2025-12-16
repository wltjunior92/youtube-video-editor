import { FastifyReply, FastifyRequest } from 'fastify';
import { join } from 'node:path';
import { IStoryboard } from '../interfaces/globalState';
import { notifyProgress } from '../utils/notifyProgress';
import { copyReferences } from '../utils/copyReferences';
import { updateGlobalState } from '../data/update';
import { checkFileExists } from '../utils/checkFileExists';
import { startShortVideoEditing } from '../bots/short/shortVideoEditor';
import { startLongVideoEditing } from '../bots/long/longVideoEditor';

export async function startProductionEstourouNoticia(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { slug, storyboard } = request.body as { slug: string, storyboard: IStoryboard }

  if (!slug) {
    return reply
      .status(400)
      .send({ message: 'Slug is required' })
  }

  if (!storyboard) {
    return reply
      .status(400)
      .send({ message: 'Storyboard is required' })
  }

  await updateGlobalState({ path_name: slug, storyboard })

  await notifyProgress({
    message: `Produzindo vídeos do vídeo: ${storyboard.social_title}`
  })
  
  const { message_id } = await notifyProgress({
    message: `>> Copiando arquivos necessários`
  })
  const currentState = await updateGlobalState({ message_id })
  
  await copyReferences(slug)
  if (currentState.storyboard?.shortVideo) {
    const shortVideoPath = join(process.cwd(), 'videos', 'estourouNoticia', currentState.path_name!, 'short', `${currentState.path_name}.mp4`);
    const alreadyExistsShortVideo = await checkFileExists(shortVideoPath)
    if (!alreadyExistsShortVideo) {
      await notifyProgress({
        message: '>> Iniciando etapa de vídeo curto', 
        message_id: currentState.message_id,
      })
      
      await startShortVideoEditing(currentState)
    }
  }

  if (currentState.storyboard?.longVideo) {
    const longVideoPath = join(process.cwd(), 'videos', 'estourouNoticia', currentState.path_name!, 'long', `${currentState.path_name}.mp4`);
    const alreadyExistsLongVideo = await checkFileExists(longVideoPath)
    if (!alreadyExistsLongVideo) {
      await notifyProgress({
        message: '>> Iniciando etapa de vídeo longo', 
      })

      await startLongVideoEditing(currentState)
    }
  }

  return reply
    .status(200)
    .send({ message: 'Hello, world!' })
}
