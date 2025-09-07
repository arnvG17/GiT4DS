import rateLimit from 'express-rate-limit';


export const loginLimiter = rateLimit({
windowMs: 15 * 60 * 1000,
max: 8,
message: { error: 'Too many login attempts, try again later' }
});