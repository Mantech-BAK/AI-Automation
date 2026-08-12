const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const path = require('path');

const { pool } = require('./db');
const { requireAuth } = require('./middleware/auth');
const authRouter = require('./routes/auth');
const dashboardRouter = require('./routes/dashboard');
const workOrdersRouter = require('./routes/workorders');
const emailRouter = require('./routes/email');
const meetingsRouter = require('./routes/meetings');
const settingsRouter = require('./routes/settings');
const systemRouter = require('./routes/system');
const { startStatusTracker } = require('./jobs/statusTracker');
const { startEmailProcessor } = require('./jobs/emailProcessor');

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3000;
const clientDistPath = path.join(__dirname, 'client', 'dist');

app.use(helmet());
app.use(
  cors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'maintenance-system-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      httpOnly: true,
    },
  })
);

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT NOW()');
    return res.json({ success: true, databaseConnected: true });
  } catch (error) {
    console.error('Database health check failed', error);
    return res.status(503).json({ success: false, databaseConnected: false });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/dashboard', requireAuth, dashboardRouter);
app.use('/api/workorders', requireAuth, workOrdersRouter);
app.use('/api/email', emailRouter);
app.use('/api/meetings', requireAuth, meetingsRouter);
app.use('/api/settings', requireAuth, settingsRouter);
app.use('/api/system', requireAuth, systemRouter);

app.use(express.static(clientDistPath));

app.use((req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

startStatusTracker();
startEmailProcessor();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
