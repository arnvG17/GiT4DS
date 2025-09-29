// routes/webhook.js
import express from "express";
import User from "../models/User.js";
import Commit from "../models/Commit.js";
import { webhookLimiter, leaderboardLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

/**
 * compute leaderboard snapshot:
 * - totalCommits
 * - firstCommitRankings (full commit doc for earliest commit per user)
 * - latestCommitRankings (full commit doc for latest commit per user)
 * - recentActivity (latest commits globally)
 */
async function calculateAndFetchLeaderboardData() {
  // 1) total commits per user
  const commitCounts = await Commit.aggregate([
    { $group: { _id: "$userId", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 200 }
  ]);

  // 2) full earliest commit per user:
  // Sort ascending by timestamp, then group and take first document (the earliest)
  const firstCommitsAgg = await Commit.aggregate([
    { $sort: { timestamp: 1, _id: 1 } },
    { $group: { _id: "$userId", firstCommit: { $first: "$$ROOT" } } },
    { $limit: 200 }
  ]);

  // 3) full latest commit per user:
  const latestCommitsAgg = await Commit.aggregate([
    { $sort: { timestamp: -1, _id: -1 } },
    { $group: { _id: "$userId", latestCommit: { $first: "$$ROOT" } } },
    { $limit: 200 }
  ]);

  // 4) populate user details for each aggregation result
  const usersWithCounts = await User.populate(commitCounts, { path: "_id", select: "username teamName" });
  const usersWithFirst = await User.populate(firstCommitsAgg, { path: "_id", select: "username teamName" });
  const usersWithLatest = await User.populate(latestCommitsAgg, { path: "_id", select: "username teamName" });

  // 5) recent activity (global latest commits)
  const recentActivity = await Commit.find()
    .sort({ timestamp: -1 })
    .limit(200)
    .populate("userId", "username teamName")
    .lean();

  // Normalize outputs
  return {
    totalCommits: usersWithCounts.map(u => ({
      userId: u._id && u._id._id ? u._id._id : u._id,
      username: u._id?.username || null,
      teamName: u._id?.teamName || null,
      count: u.count
    })),

    firstCommitRankings: usersWithFirst.map(u => ({
      userId: u._id && u._id._id ? u._id._id : u._id,
      username: u._id?.username || null,
      teamName: u._id?.teamName || null,
      firstCommit: u.firstCommit ? {
        sha: u.firstCommit.sha,
        message: u.firstCommit.message,
        timestamp: u.firstCommit.timestamp,
        repoFullName: u.firstCommit.repoFullName,
        authorName: u.firstCommit.authorName,
        authorEmail: u.firstCommit.authorEmail
      } : null
    })),

    latestCommitRankings: usersWithLatest.map(u => ({
      userId: u._id && u._id._id ? u._id._id : u._id,
      username: u._id?.username || null,
      teamName: u._id?.teamName || null,
      latestCommit: u.latestCommit ? {
        sha: u.latestCommit.sha,
        message: u.latestCommit.message,
        timestamp: u.latestCommit.timestamp,
        repoFullName: u.latestCommit.repoFullName,
        authorName: u.latestCommit.authorName,
        authorEmail: u.latestCommit.authorEmail
      } : null
    })),

    recentActivity: recentActivity.map(c => ({
      sha: c.sha,
      userId: c.userId?._id || null,
      username: c.userId?.username || null,
      teamName: c.userId?.teamName || null,
      repo: c.repoFullName,
      message: c.message,
      timestamp: c.timestamp
    }))
  };
}

// small injector helper to get IO instance if app stored it
const injectIo = (req, res, next) => {
  req.io = req.app && req.app.get('io') ? req.app.get('io') : (req.io || null);
  next();
};

/**
 * POST /github
 * - quick 202 response to GitHub
 * - processes payload async (in an IIFE) so GitHub isn't blocked
 * - robust timestamp extraction & dedupe logic
 */
router.post('/github', webhookLimiter, injectIo, express.json(), async (req, res) => {
  console.log('Webhook activated.');
  const event = req.get('X-GitHub-Event') || req.get('x-github-event') || 'unknown';
  if (event === 'ping') return res.status(202).send('Ping received.');

  // respond immediately
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
          // Map commits robustly
          const commitDocs = commits.map(c => {
            // prefer timestamp from commit object, fallback to head_commit or now
            const ts = c.timestamp || c.commit?.timestamp || payload.head_commit?.timestamp || null;
            const sha = c.id || c.sha || c.commit?.id || (c.commit && c.commit.tree && c.commit.tree.sha) || null;
            return {
              userId: user._id,
              sha,
              message: c.message || c.commit?.message || '',
              timestamp: ts ? new Date(ts) : new Date(),
              repoFullName,
              authorName: c.author?.name || c.commit?.author?.name || null,
              authorEmail: c.author?.email || c.commit?.author?.email || null
            };
          }).filter(d => d.sha); // require sha

          // dedupe existing SHAs for that repo
          const shas = commitDocs.map(d => d.sha);
          const existing = await Commit.find({ repoFullName, sha: { $in: shas } }).select('sha').lean();
          const existingSet = new Set(existing.map(e => e.sha));
          const filtered = commitDocs.filter(d => !existingSet.has(d.sha));

          if (filtered.length > 0) {
            // insert, allow unordered to survive duplicates
            await Commit.insertMany(filtered, { ordered: false });
            console.log(`Stored ${filtered.length} commits for ${repoFullName}.`);
          } else {
            console.log('No new commits to store (all SHAs already present).');
          }
        }
      } else {
        // ignore non-push events for commit insert
        console.log(`Received non-push event '${event}' for ${repoFullName}.`);
      }

      // recompute leaderboard and broadcast
      const currentLeaderboard = await calculateAndFetchLeaderboardData();
      const io = req.io || (req.app && req.app.get('io'));
      if (!io) {
        console.warn('No Socket.IO instance found; skipping broadcast.');
      } else {
        io.emit('leaderboard:update', currentLeaderboard);
        console.log('Broadcasted leaderboard:update via Socket.IO.');
      }
    } catch (err) {
      console.error('Error processing webhook:', err);
    }
  })();
});

// GET /admin/leaderboard -> snapshot for clients (preload)
router.get('/admin/leaderboard', leaderboardLimiter, async (req, res) => {
  try {
    const data = await calculateAndFetchLeaderboardData();
    res.json(data);
  } catch (err) {
    console.error('Failed to fetch leaderboard:', err);
    res.status(500).json({ error: 'failed' });
  }
});

export default router;
