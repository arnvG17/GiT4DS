import rateLimit from 'express-rate-limit';

// Authentication Rate Limiters
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 8, // 8 attempts per window
  message: { error: 'Too many login attempts, try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const oauthCallbackLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // 10 OAuth callbacks per window
  message: { error: 'Too many OAuth attempts, try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// User API Rate Limiters
export const userDataLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  message: { error: 'Too many requests for user data, please slow down' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const userSubmitLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // 5 repo submissions per 10 minutes
  message: { error: 'Too many repository submissions, please wait before trying again' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Webhook Rate Limiters
export const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 webhook calls per minute (GitHub can send many)
  message: { error: 'Webhook rate limit exceeded' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const leaderboardLimiter = rateLimit({
  windowMs: 30 * 1000, // 30 seconds
  max: 20, // 20 leaderboard requests per 30 seconds
  message: { error: 'Too many leaderboard requests, please slow down' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Admin API Rate Limiters
export const adminLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // 20 admin requests per minute
  message: { error: 'Too many admin requests, please slow down' },
  standardHeaders: true,
  legacyHeaders: false,
});

// General API Rate Limiter (catch-all)
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  message: { error: 'Too many requests, please slow down' },
  standardHeaders: true,
  legacyHeaders: false,
});