import type { FastifyInstance } from 'fastify';
import { readData, writeData } from '../storage.js';
import type { AppData } from '../storage.js';

export function dataRoutes(fastify: FastifyInstance): void {
  fastify.get('/api/data', async (_req, reply) => {
    const { data, usedBackup } = await readData();
    return reply.send({ ...data, _restoredFromBackup: usedBackup });
  });

  fastify.put<{ Body: AppData }>(
    '/api/data',
    {
      schema: { body: { type: 'object' } },
    },
    async (req, reply) => {
      await writeData(req.body);
      return reply.send({ ok: true });
    },
  );
}
