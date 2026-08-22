import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import type { Express, RequestHandler } from "express";
import { storage } from "./storage";
import { pool } from "./db";
import type { User } from "@shared/schema";

// Configure session middleware
export function getSession() {
  let sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'SESSION_SECRET environment variable must be set in production. ' +
        'Add it as a Replit Secret before deploying — without it, session cookies ' +
        'would be signed with a value visible in source control, letting anyone forge them.'
      );
    }
    console.warn('⚠️ SESSION_SECRET not set — using an insecure dev-only fallback. Do not use this outside local development.');
    sessionSecret = 'wondervoya-dev-secret-DO-NOT-USE-IN-PRODUCTION';
  }

  const PgStore = connectPgSimple(session);

  return session({
    store: new PgStore({
      pool,
      tableName: 'sessions', // Matches the `sessions` table already defined in shared/schema.ts
      // The table is managed via drizzle (npm run db:push), not created here:
      // letting connect-pg-simple create it on every boot raced against Neon's
      // serverless driver and crashed with "IDX_session_expire already exists".
      createTableIfMissing: false,
    }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: true,
    name: 'wondervoya.sid', // Custom session name
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Enable secure in production
      maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week
      sameSite: 'strict' // Stricter CSRF protection
    },
  });
}

// Setup Google OAuth authentication
export function setupAuth(app: Express) {
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  // Hosts this deployment is legitimately served from. The Host header is
  // client-supplied and must not be trusted blindly for building the OAuth
  // callback URL (a spoofed Host could redirect the OAuth flow to an
  // attacker-controlled domain). Configure additional hosts via
  // ALLOWED_OAUTH_HOSTS (comma-separated) if this app is also served from a
  // custom domain or a Replit dev-workspace URL.
  const allowedOAuthHosts = new Set(
    (process.env.ALLOWED_OAUTH_HOSTS || '')
      .split(',')
      .map(h => h.trim())
      .filter(Boolean)
  );

  // Create a custom strategy class that can handle dynamic callback URLs
  class DynamicGoogleStrategy extends GoogleStrategy {
    authenticate(req: any, options?: any) {
      const host = req.get('host');
      if (!host || (allowedOAuthHosts.size > 0 && !allowedOAuthHosts.has(host))) {
        console.error(`❌ Rejected OAuth attempt with unrecognized host: ${host}`);
        return (this as any).error(new Error('Unrecognized host for OAuth callback'));
      }
      (this as any)._callbackURL = `https://${host}/api/auth/google/callback`;
      console.log("Using dynamic callback URL:", (this as any)._callbackURL);
      super.authenticate(req, options);
    }
  }

  // Configure dynamic Google OAuth strategy
  passport.use(new DynamicGoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    callbackURL: "/api/auth/google/callback" // Will be overridden dynamically
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      // Extract user information from Google profile
      const userData = {
        id: profile.id,
        email: profile.emails?.[0]?.value || null,
        firstName: profile.name?.givenName || null,
        lastName: profile.name?.familyName || null,
        profileImageUrl: profile.photos?.[0]?.value || null,
      };

      // Upsert user in storage
      const user = await storage.upsertUser(userData);
      return done(null, user);
    } catch (error) {
      return done(error as Error, undefined);
    }
  }));

  // Serialize user for session
  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  // Deserialize user from session
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });

  // Auth routes  
  app.get("/api/auth/google", (req, res, next) => {
    console.log("Starting Google OAuth flow");
    const host = req.get('host');
    console.log("Request host:", host);
    console.log("Will use callback URL for:", `https://${host}/api/auth/google/callback`);
    
    passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
  });

  app.get("/api/auth/google/callback", (req, res, next) => {
    console.log("Received Google OAuth callback");
    passport.authenticate("google", (err: any, user: any, info: any) => {
      console.log("Google authentication callback result:", { 
        hasError: !!err, 
        errorMessage: err?.message, 
        hasUser: !!user, 
        userEmail: user?.email,
        info 
      });
      
      if (err) {
        console.log("Google OAuth error:", err);
        return res.redirect("/login-failed");
      }
      if (!user) {
        console.log("No user returned from Google:", info);
        return res.redirect("/login-failed");
      }
      
      req.logIn(user, async (loginErr) => {
        if (loginErr) {
          console.log("Google login error:", loginErr);
          return res.redirect("/login-failed");
        }
        
        console.log("User successfully authenticated with Google:", user.email);
        const userJson = JSON.stringify(user);
        res.send(`
          <script>
            // Notify parent window of successful authentication
            if (window.opener) {
              window.opener.postMessage({ type: 'AUTH_SUCCESS', user: ${userJson} }, '*');
            }
            window.close();
          </script>
        `);
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ message: "Failed to logout" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get("/api/auth/user", (req, res) => {
    if (req.isAuthenticated() && req.user) {
      res.json(req.user);
    } else {
      res.status(401).json({ message: "Not authenticated" });
    }
  });
}

// Authentication middleware
export const requireAuth: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: "Authentication required" });
};

export const optionalAuth: RequestHandler = (req, res, next) => {
  // Always proceed, but req.user will be undefined if not authenticated
  next();
};