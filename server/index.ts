import Fastify from 'fastify';
import { dataRoutes } from './routes/data.js';

const app = Fastify({ logger: false });

await app.register(dataRoutes);

const PORT = 3001;
const HOST = '127.0.0.1';

try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`Server listening on http://${HOST}:${PORT}`);
} catch (err) {
  console.error(err);
  process.exit(1);
}
