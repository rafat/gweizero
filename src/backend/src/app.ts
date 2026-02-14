import express from 'express';
import cors from 'cors';
import analysisRoutes from './api/routes/analysis.routes';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) =>
  res.send('GweiZero Backend Running!')
);

app.use('/api', analysisRoutes);

export default app;
