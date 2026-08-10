import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { registerRoutes } from "./routes";
import { setupUltimateSearchRoutes } from "./routes/ultimate-search";
import { setupVite, serveStatic, log } from "./vite";
import { csvTagManager } from "./services/csv-tag-manager";

const app = express();
app.set('trust proxy', 1);

// Security middleware - relaxed for development
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https:", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:", "*"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https:", "https://cdnjs.cloudflare.com"],
      connectSrc: ["'self'", "ws:", "wss:", "https:", "*"],
      frameSrc: ["'self'", "https:", "https://accounts.google.com"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// Rate limiting - more permissive for development
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased limit for development
  message: { error: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000, // Much higher limit for API routes in development
  message: { error: "API rate limit exceeded" },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);
app.use('/api', apiLimiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// CORS: the frontend is served from the same origin as this API, so no
// cross-origin access is needed by default. Reflecting any Origin back with
// Access-Control-Allow-Credentials: true (the previous behavior) would let
// any website make credentialed requests against this API. Only origins
// listed in ALLOWED_CORS_ORIGINS (comma-separated) are granted CORS access;
// same-origin requests are unaffected either way since browsers don't send
// CORS headers for those.
const allowedCorsOrigins = new Set(
  (process.env.ALLOWED_CORS_ORIGINS || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean)
);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedCorsOrigins.has(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  }

  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Initialize services
  try {
    // Initialize tag manager for enhanced search
    console.log('🏷️ Initializing CSV-based tag manager...');
    // CSV tag manager initializes automatically on first use
    const status = csvTagManager.getCacheStatus();
    console.log(`✅ CSV tag manager ready: ${status.size} tags from taxonomy`);
  } catch (error) {
    console.error('⚠️ Error initializing CSV tag manager:', error);
  }

  try {
    const { auxiliaryDataManager } = await import('./services/auxiliary-data-manager');
    await auxiliaryDataManager.initializeAuxiliaryData();
    console.log('✅ Auxiliary data management initialized');
  } catch (error) {
    console.error('⚠️ Error initializing auxiliary data management:', error);
  }

  const server = await registerRoutes(app);

  // Setup ultimate search routes
  setupUltimateSearchRoutes(app);

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Please stop any existing processes and try again.`);
      process.exit(1);
    } else {
      console.error('Server error:', err);
      process.exit(1);
    }
  });

  server.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
  });
})();