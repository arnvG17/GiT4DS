import express from "express";
import User from "../models/User.js";
import Commit from "../models/Commit.js";

const router = express.Router();

// --- Helper: build leaderboard data ---
async function calculateAndFetchLeaderboardData() {
  // Total commits per user
  const commitCounts = await Commit.aggregate([
    { $group: { _id: "$userId", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]);

  // Earliest commit per user
  const firstCommits = await Commit.aggregate([
    { $group: { _id: "$userId", firstCommitTimestamp: { $min: "$timestamp" } } },
    { $sort: { firstCommitTimestamp: 1 } }
  ]);

  // Populate user details
  const usersWithCounts = await User.populate(commitCounts, { path: "_id", select: "username teamName" });
  const usersWithFirstCommits = await User.populate(firstCommits, { path: "_id", select: "teamName username" });

  const recentActivity = await Commit.find()
    .sort({ timestamp: -1 })
    .limit(10)
    .populate("userId", "username teamName")
    .lean();

  return {
    totalCommits: usersWithCounts.map(u => ({
      userId: u._id._id || u._id, // sometimes populate shape may differ
      username: u._id.username,
      teamName: u._id.teamName,
      count: u.count
    })),
    firstCommitRankings: usersWithFirstCommits.map(u => ({
      userId: u._id._id || u._id,
      username: u._id.username,
      teamName: u._id.teamName,
      firstCommitTimestamp: u.firstCommitTimestamp
    })),
    recentActivity: recentActivity.map(c => ({
      username: c.userId?.username,
      teamName: c.userId?.teamName,
      repo: c.repoFullName,
      message: c.message,
      timestamp: c.timestamp
    }))
  };
}

// Middleware: small injector in case someone didn't set app-level injection
const injectIo = (req, res, next) => {
  // try to get io from app (recommended)
  req.io = req.app && req.app.get('io') ? req.app.get('io') : (req.io || null);
  next();
};

// --- POST /github ---
// This is a simple, no-security webhook handler intended for personal/dev use.
router.post('/github', injectIo, express.json(), async (req, res) => {
  console.log('Webhook activated (simple mode).');

  const event = req.get('X-GitHub-Event') || req.get('x-github-event') || 'unknown';

  if (event === 'ping') return res.status(202).send('Ping received.');

  // immediate response to GitHub
  res.status(202).send(`Accepted ${event}`);

  (async () => {
    try {
      const payload = req.body || {};
      const repoFullName = payload.repository?.full_name || payload.repository?.fullName || null;
      if (!repoFullName) {
        console.warn('No repository info in payload; skipping.');
        return;
      }

      // find user that registered this repo
      const user = await User.findOne({ 'activeWebhooks.repoFullName': repoFullName });
      if (!user) {
        console.warn(`No registered user for repo: ${repoFullName}`);
        return;
      }

      if (event === 'push') {
        const commits = payload.commits || [];
        if (commits.length === 0) {
          console.log(`Push for ${repoFullName} had no commits.`);
        } else {
          // Map commits to DB docs (basic mapping)
          const commitDocs = commits.map(c => ({
            userId: user._id,
            sha: c.id || c.sha,
            message: c.message || (c.commit && c.commit.message) || '',
            timestamp: c.timestamp ? new Date(c.timestamp) : (c.timestamp === 0 ? new Date(0) : new Date()),
            repoFullName,
            authorName: c.author?.name || c.commit?.author?.name,
            authorEmail: c.author?.email || c.commit?.author?.email
          }));

          // Optional dedupe: skip if sha already exists for same repo
          const shas = commitDocs.map(d => d.sha).filter(Boolean);
          const existing = await Commit.find({ repoFullName, sha: { $in: shas } }).select('sha').lean();
          const existingSet = new Set(existing.map(e => e.sha));
          const filtered = commitDocs.filter(d => !existingSet.has(d.sha));

          if (filtered.length > 0) {
            await Commit.insertMany(filtered, { ordered: false });
            console.log(`Stored ${filtered.length} commits for ${repoFullName}.`);
          } else {
            console.log('No new commits to store (all shas already present).');
          }
        }
      } else {
        console.log(`Received non-push event '${event}' for ${repoFullName} (ignored for commit insert).`);
      }

      // Recompute leaderboard and broadcast via real io instance
      const currentLeaderboard = await calculateAndFetchLeaderboardData();

      const io = req.io || (req.app && req.app.get('io'));
      if (!io) {
        console.warn('No Socket.IO instance found; skipping broadcast.');
      } else {
        io.emit('leaderboard:update', currentLeaderboard);
        console.log('Broadcasted leaderboard:update via Socket.IO.');
      }

    } catch (err) {
      console.error('Error processing webhook (simple):', err);
    }
  })();
});

// --- GET /admin/leaderboard ---
// Return current leaderboard snapshot for clients that just connected
router.get('/admin/leaderboard', async (req, res) => {
  try {
    const data = await calculateAndFetchLeaderboardData();
    res.json(data);
  } catch (err) {
    console.error('Failed to fetch leaderboard:', err);
    res.status(500).json({ error: 'failed' });
  }
});

export default router;
