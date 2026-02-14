import dotenv from 'dotenv';
import app from './app';

dotenv.config();

const PORT = process.env.WORKER_PORT || 3010;

app.listen(PORT, () => {
  console.log(`Worker server is running on port ${PORT}`);
});
