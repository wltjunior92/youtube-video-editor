import { FastifyInstance } from "fastify";
import { startProductionEstourouNoticia } from "./startEstourouNoticia";

export async function appRoutes(app: FastifyInstance) {
  app.post('/start-production', startProductionEstourouNoticia)
}