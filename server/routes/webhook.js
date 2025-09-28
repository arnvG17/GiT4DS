import express from "express";
import crypto from "crypto";
import User from "../models/User.js";
import Commit from "../models/Commit.js"; 

const router = express.Router();

// 💡 NEW: Helper to access the injected Socket.IO instance.
// NOTE: Your main server file MUST inject 'io' into the request (e.g., req.io = io)
const injectIo = (req, res, next) => {
    // If the IO object exists on the request (injected by the server setup) use it.
    // Otherwise, use the placeholder for local testing/debugging.
    req.io = req.io || io;
    next();
};

// Placeholder for the imported Socket.IO instance (ONLY used if req.io is not injected)
const io = { 
    emit: (event, data) => console.log(`[Socket.IO Broadcast] (Placeholder) Emitting: ${event}`, data) 
}; 

// --- Helper Functions ---

/**
 * Verifies the integrity and origin of the GitHub webhook payload using the secret.
 */
const verifySignature = (payload, signature, secret) => {
    // GitHub uses sha256. The signature header includes "sha256=".
    const hash = `sha256=${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`;
    
    // Use timingSafeEqual to prevent timing attacks
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(hash));
};


/**
 * Calculates and fetches the latest leaderboard data from the database.
 * UPDATED to include firstCommitRankings.
 */
const calculateAndFetchLeaderboardData = async () => {
    // 1. Calculate Total Commits (Group by user and count)
    const commitCounts = await Commit.aggregate([
        { $group: { _id: "$userId", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
    ]);

    // 2. Find earliest commit for each user (for the "First Commit" leaderboard)
    const firstCommits = await Commit.aggregate([
        // Group by user and find the minimum (earliest) timestamp
        { $group: { _id: "$userId", firstCommitTimestamp: { $min: "$timestamp" } } },
        // Sort by the earliest timestamp (ascending)
        { $sort: { firstCommitTimestamp: 1 } }
    ]);

    // 3. Populate User details for both aggregates
    const usersWithCounts = await User.populate(commitCounts, { path: '_id', select: 'username teamName' });
    const usersWithFirstCommits = await User.populate(firstCommits, { path: '_id', select: 'teamName' });
    
    // 4. Find most recent activity (for the live feed)
    const recentActivity = await Commit.find()
        .sort({ timestamp: -1 })
        .limit(5)
        .populate('userId', 'username teamName') // Populate user details
        .lean();

    return {
        totalCommits: usersWithCounts.map(u => ({ username: u._id.username, teamName: u._id.teamName, count: u.count })),
        
        // Return rankings for the "First Commit" leaderboard
        firstCommitRankings: usersWithFirstCommits.map(u => ({ 
            teamName: u._id.teamName, 
            firstCommitTimestamp: u.firstCommitTimestamp 
        })),

        recentActivity: recentActivity.map(c => ({
            username: c.userId.username,
            repo: c.repoFullName,
            message: c.message,
            timestamp: c.timestamp,
        }))
    };
};

// --- Webhook Route (Steps 3, 4, 5) ---

// 💡 ADD injectIo MIDDLEWARE HERE
router.post("/github", injectIo, express.raw({ type: 'application/json' }), async (req, res) => {
    // Access the actual io object (or the placeholder if not injected)
    const io = req.io;
    console.log("Webhook activated and " , req)

    // 1. Get essential headers and raw payload
    const signature = req.get('X-Hub-Signature-256');
    const event = req.get('X-GitHub-Event');
    const rawPayload = req.body.toString('utf8');
    
    // Check for push, status, or create events
    const allowedEvents = ['push', 'status', 'create'];

    if (!signature || !allowedEvents.includes(event)) {
        return res.status(400).send(`Webhook rejected: Missing signature or event is not one of ${allowedEvents.join(', ')}.`);
    }

    // IMMEDIATE RESPONSE: Send a non-blocking response (202 Accepted) to GitHub ASAP
    res.status(202).send(`Webhook accepted for event: ${event}. Processing in background.`);


    try {
        const payload = JSON.parse(rawPayload);
        const repoFullName = payload.repository?.full_name;
        
        if (!repoFullName) return; // Exit background task if no repo is specified

        // 2. Find the associated user and secret
        const user = await User.findOne({ "activeWebhooks.repoFullName": repoFullName });
        
        if (!user) {
            console.warn(`Webhook received for unregistered repo: ${repoFullName}. Discarding.`);
            return;
        }
        
        const webhookEntry = user.activeWebhooks.find(h => h.repoFullName === repoFullName);
        const secret = webhookEntry?.webhookSecret;
        
        if (!secret) {
            console.error(`Secret missing for repo: ${repoFullName}. Discarding.`);
            return;
        }

        // 3. Verify Signature (CRITICAL SECURITY STEP)
        if (!verifySignature(rawPayload, signature, secret)) {
            console.warn(`Invalid signature for repo: ${repoFullName}. Possible tampering. Discarding payload.`);
            return; 
        }
        
        // 4. Process and Store Commits ONLY if it's a PUSH event
        if (event === 'push') {
            const commits = payload.commits || [];
            if (commits.length === 0) {
                console.log(`Push event received for ${repoFullName} but no new commits (e.g., branch deletion).`);
            } else {
                const commitInserts = commits.map(commit => ({
                    userId: user._id,
                    sha: commit.id,
                    message: commit.message,
                    timestamp: new Date(commit.timestamp),
                    repoFullName: repoFullName,
                    authorName: commit.author.name,
                    authorEmail: commit.author.email,
                }));

                await Commit.insertMany(commitInserts);
                console.log(`Successfully stored ${commits.length} new commits for ${repoFullName}.`);
            }
        } else {
            // Log that a non-push event was successfully verified.
            console.log(`Acknowledging verified non-push event (${event}) for ${repoFullName}. No commit data saved.`);
        }

        // 5. Calculate and Emit Real-Time Leaderboard Update (Triggered on any verified, relevant event)
        const currentLeaderboard = await calculateAndFetchLeaderboardData(); 
        console.log(currentLeaderboard)
        
        // This is the real-time push to the dashboard:
        io.emit('leaderboard:update', currentLeaderboard); 
        console.log(`✅ Real-time dashboard update broadcasted after '${event}' event.`);

    } catch (error) {
        console.error("Error processing GitHub webhook in background:", error);
    }
});

export default router;
