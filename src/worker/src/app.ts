import cors from 'cors';
import express from 'express';
import jobsRoutes from './api/routes/jobs.routes';

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/', (_req, res) => {
  res.send('GweiZero Worker Running!');
});

app.use('/jobs', jobsRoutes);

export default app;
