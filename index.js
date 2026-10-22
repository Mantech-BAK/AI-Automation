const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const cron = require('node-cron');
const path = require('path');

const { pool } = require('./db');
const { requireAuth } = require('./middleware/auth');
const authRouter = require('./routes/auth');
const dashboardRouter = require('./routes/dashboard');
const employeesRouter = require('./routes/employees');
const workOrdersRouter = require('./routes/workorders');
const emailRouter = require('./routes/email');
const meetingsRouter = require('./routes/meetings');
const settingsRouter = require('./routes/settings');
const systemRouter = require('./routes/system');
const notificationsConfigRouter = require('./routes/notifications-config');
const usersRouter = require('./routes/users');
const vehiclesRouter = require('./routes/vehicles');
const projectsRouter = require('./routes/projects');
const { startStatusTracker } = require('./jobs/statusTracker');
const { processEmails } = require('./jobs/emailProcessor');
const { processDocumentEmails, removeDuplicateDocuments } = require('./jobs/documentEmailProcessor');

dotenv.config({ path: path.join(__dirname, '.env') });

// A failing background job or stray rejection should be logged, not take the
// whole API down.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

if (!process.env.DATABASE_URL && !process.env.DB_HOST) {
  console.warn('WARNING: DATABASE_URL is not set - falling back to localhost PostgreSQL.');
}
if (!process.env.SESSION_SECRET) {
  console.warn('WARNING: SESSION_SECRET is not set - using an insecure default.');
}

const app = express();
const PORT = process.env.PORT || 3000;
const clientDistPath = path.join(__dirname, 'client', 'dist');

// Hosted (Railway / Render / production): the Vercel frontend and this API are different
// sites, so the session cookie has to be Secure + SameSite=None. Don't depend on NODE_ENV
// alone - Railway and Render each set their own marker variable.
const isHosted = process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.RENDER);

// Explicitly allowed frontend origins: FRONTEND_URL (preferred) or CLIENT_URL, trailing slash ignored.
const extraOrigins = [process.env.FRONTEND_URL, process.env.CLIENT_URL].filter(Boolean).map((url) => url.replace(/\/+$/, ''));

// Railway (and Render) terminate TLS at their proxy; trust it so secure cookies
// and rate limiting see the real protocol / client IP.
app.set('trust proxy', 1);

app.use(helmet());
app.use(
  cors({
    // Local dev, any Vercel (*.vercel.app) or Railway (*.up.railway.app) origin, and an optional explicit
    // FRONTEND_URL / CLIENT_URL (e.g. a custom domain). Requests with no Origin (curl, health
    // checks, same-origin) are allowed through.
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      const allowed =
        ['http://localhost:5173', 'http://127.0.0.1:5173', ...extraOrigins].includes(origin) ||
        /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.(vercel\.app|up\.railway\.app)$/i.test(origin);
      return callback(null, allowed);
    },
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
      // The Vercel frontend and the Render API are different sites, so the
      // session cookie must be SameSite=None; Secure in production.
      secure: isHosted,
      sameSite: isHosted ? 'none' : 'lax',
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

app.get('/', (req, res) => {
  res.send('Server is running');
});

app.use('/api/auth', authRouter);
app.use('/api/dashboard', requireAuth, dashboardRouter);
app.use('/api/employees', requireAuth, employeesRouter);
app.use('/api/workorders', requireAuth, workOrdersRouter);
app.use('/api/email', emailRouter);
app.use('/api/meetings', requireAuth, meetingsRouter);
app.use('/api/settings', requireAuth, settingsRouter);
app.use('/api/system', requireAuth, systemRouter);
app.use('/api/notifications-config', requireAuth, notificationsConfigRouter);
app.use('/api/users', requireAuth, usersRouter);
app.use('/api/vehicles', requireAuth, vehiclesRouter);
app.use('/api/projects', requireAuth, projectsRouter);

app.use(express.static(clientDistPath));

app.use((req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

startStatusTracker();
// Documents module columns (cr_no, license_no, processed_at) - idempotent; then the duplicate clean-up.
require('./db/documentColumns')
  .ensureDocumentColumns(pool)
  .catch((error) => console.error('Document column setup failed:', error.message));
removeDuplicateDocuments().catch((error) => {
  console.error('Duplicate document clean-up failed:', error.message);
});

// One combined schedule: documents first, then the general email processor,
// so PDF emails are handled (and marked read) before the generic summariser
// looks at the mailbox. Each step is isolated so one failing doesn't skip the other.
cron.schedule('0,30 * * * *', async () => {
  try {
    await processDocumentEmails();
  } catch (error) {
    console.error('Document email processor job failed:', error.message, error.stack);
  }

  try {
    await processEmails();
  } catch (error) {
    console.error('Email processor job failed:', error.message, error.stack);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
