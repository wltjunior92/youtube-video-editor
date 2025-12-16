import Fastify from 'fastify';
import { appRoutes } from './routes';
import { resetGlobalState } from './data/reset';

export const app = Fastify();

app.register(appRoutes);