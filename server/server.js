import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import passport from 'passport';
import session from 'express-session';
import MongoStore from 'connect-mongo';

// Import Routes
import authRoutes from './routes/auth.js';
import repoRoutes from './routes/user.js'; // Assuming this is correct, but typically user routes handle repo submission
import webhookRoutes from './routes/webhook.js';
import userRoutes from './routes/user.js';
import adminRoutes from './routes/team.js'



dotenv.config();

const app = express();
const server = http.createServer(app);

// 1. Initialize Socket.IO and attach it to the HTTP server
export const io = new Server(server, {
    cors: { 
        origin: process.env.FRONTEND_ORIGIN || '*', 
        credentials: true 
    }
});
app.set('io', io); // Set on app for access in middleware if needed

// ✅ Use MongoDB-backed session store
app.use(
    session({
        secret: process.env.SESSION_SECRET || "mysupersecretkey",
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({
            mongoUrl: process.env.MONGO_URI,
            collectionName: "sessions",
        }),
        cookie: {
            secure: false,          
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000, // 1 day
        },
    })
);

// Passport init
app.use(passport.initialize());
app.use(passport.session());

// Security and Parsing
app.use(helmet());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
// NOTE: CORS is configured here again, ensure process.env.FRONTEND_ORIGIN matches your client URL
app.use(cors({ origin: process.env.FRONTEND_ORIGIN, credentials: true }));

// Routes
app.use('/auth', authRoutes);
app.use('/repo', repoRoutes);
app.use('/webhook', webhookRoutes); // This route will use the 'io' instance
app.use('/user', userRoutes);
app.use('/admin', adminRoutes);


app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 5000;

// Database Connection and Server Start
mongoose
    .connect(process.env.MONGO_URI, { autoIndex: true })
    .then(() => {
        console.log('✅ Connected to MongoDB');
        server.listen(PORT, () => console.log('🚀 Server listening on', PORT));
    })
    .catch(err => console.error('❌ Mongo connection error', err));

// Socket.IO Connection Handler
io.on('connection', (socket) => {
    console.log('🔌 socket connected', socket.id);
    // Optional: Join a 'leaderboard' room here if you want to scope broadcasts
    // socket.join('leaderboard'); 
    
    socket.on('disconnect', () => console.log('❌ socket disconnected', socket.id));
});

// 2. Export the Socket.IO instance for use in other files (like webhook.js)
// Note: I moved the io definition to be 'export const io = new Server(...)' 
// to make it directly available for import in other modules.
