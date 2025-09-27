import express from "express";
import crypto from "crypto";
import User from "../models/User.js";
import Commit from "../models/Commit.js"; 
// 💡 IMPORTANT: Assume 'io' is the exported Socket.IO server instance
// e.g., import { io } from "../server.js"; 

const router = express.Router();
// Placeholder for the imported Socket.IO instance (must be exported from your main server file)
const io = { 
    emit: (event, data) => console.log(`[Socket.IO Broadcast] Emitting: ${event}`, data) 
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
 * This function handles the "Compute leaderboard" part of Step 5.
 */
const calculateAndFetchLeaderboardData = async () => {
    // 1. Calculate Total Commits (Group by user and count)
    const commitCounts = await Commit.aggregate([
        { $group: { _id: "$userId", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
    ]);

    // 2. Fetch User details for the commit counts
    const usersWithCounts = await User.populate(commitCounts, { path: '_id', select: 'username teamName' });
    
    // 3. Find most recent activity (for the live feed)
    const recentActivity = await Commit.find()
        .sort({ timestamp: -1 })
        .limit(5)
        .populate('userId', 'username teamName') // Populate user details
        .lean();

    return {
        totalCommits: usersWithCounts.map(u => ({ username: u._id.username, teamName: u._id.teamName, count: u.count })),
        recentActivity: recentActivity.map(c => ({
            username: c.userId.username,
            repo: c.repoFullName,
            message: c.message,
            timestamp: c.timestamp,
        }))
        // You would add "first commit" logic here if needed
    };
};

// --- Webhook Route (Steps 3, 4, 5) ---

router.post("/github", express.raw({ type: 'application/json' }), async (req, res) => {
    // 1. Get essential headers and raw payload
    const signature = req.get('X-Hub-Signature-256');
    const event = req.get('X-GitHub-Event');
    const rawPayload = req.body.toString('utf8');
    
    if (!signature || event !== 'push') {
        return res.status(400).send('Webhook rejected: Missing signature or event is not "push".');
    }

    try {
        const payload = JSON.parse(rawPayload);
        const repoFullName = payload.repository?.full_name;
        const commits = payload.commits || [];

        if (!repoFullName) return res.status(400).send('Invalid payload: Missing repository info.');
        
        // 2. Find the associated user and secret
        const user = await User.findOne({ "activeWebhooks.repoFullName": repoFullName });
        
        if (!user) {
            return res.status(404).send('Repo not registered for tracking.');
        }
        
        const webhookEntry = user.activeWebhooks.find(h => h.repoFullName === repoFullName);
        const secret = webhookEntry?.webhookSecret;
        
        if (!secret) {
            console.error(`Secret missing for repo: ${repoFullName}`);
            return res.status(500).send('Configuration error: Webhook secret not found.');
        }

        // 3. Verify Signature (CRITICAL SECURITY STEP)
        if (!verifySignature(rawPayload, signature, secret)) {
            console.warn(`Invalid signature for repo: ${repoFullName}. Possible tampering.`);
            return res.status(403).send('Invalid signature.');
        }
        
        // 4. Process and Store Commits (Step 5)
        if (commits.length === 0) {
            return res.send('No new commits to process (e.g., branch deletion).');
        }
        
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

        // 5. Calculate and Emit Real-Time Leaderboard Update (Steps 5 & 4)
        const currentLeaderboard = await calculateAndFetchLeaderboardData(); 
        
        // This is the real-time push to the dashboard:
        io.emit('leaderboard:update', currentLeaderboard); 

        res.send('Webhook successfully processed and dashboard updated.');

    } catch (error) {
        console.error("Error processing GitHub webhook:", error);
        res.status(500).json({ error: "Internal server error during processing." });
    }
});

export default router;
