// server/routes/webhook.js  (or wherever you keep it)
import express from "express";
import User from "../models/User.js";
import Commit from "../models/Commit.js";

const router = express.Router();

async function calculateAndFetchLeaderboardData() {
  // Total commits per user (Highest count first)
  const commitCounts = await Commit.aggregate([
    { $group: { _id: "$userId", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 20 }
  ]);

  // Earliest commit per user (first commit time) -> sort ascending (earliest first)
  const firstCommits = await Commit.aggregate([
    { $group: { _id: "$userId", firstCommitTimestamp: { $min: "$timestamp" } } },
    { $sort: { firstCommitTimestamp: 1 } } // earliest first
  ]);

  // Latest commit per user (for "most recent commit" ranking) -> group by max timestamp, sort desc
  const latestCommits = await Commit.aggregate([
    { $group: { _id: "$userId", latestCommitTimestamp: { $max: "$timestamp" } } },
    { $sort: { latestCommitTimestamp: -1 } } // most recent first
  ]);

  // Populate user details; aggregation returns {_id: <userId>, ...}
  const usersWithCounts = await User.populate(commitCounts, { path: "_id", select: "username teamName" });
  const usersWithFirst = await User.populate(firstCommits, { path: "_id", select: "username teamName" });
  const usersWithLatest = await User.populate(latestCommits, { path: "_id", select: "username teamName" });

  // Recent activity: full commits (latest first)
  const recentActivity = await Commit.find()
    .sort({ timestamp: -1 })
    .limit(50)
    .populate("userId", "username teamName")
    .lean();

  return {
    totalCommits: usersWithCounts.map(u => ({
      userId: (u._id && u._id._id) ? u._id._id : u._id,
      username: u._id?.username || null,
      teamName: u._id?.teamName || null,
      count: u.count
    })),

    // earliest-first ranking (first commit wins)
    firstCommitRankings: usersWithFirst.map(u => ({
      userId: (u._id && u._id._id) ? u._id._id : u._id,
      username: u._id?.username || null,
      teamName: u._id?.teamName || null,
      firstCommitTimestamp: u.firstCommitTimestamp
    })),

    // latest-first ranking (most recent commit wins)
    latestCommitRankings: usersWithLatest.map(u => ({
      userId: (u._id && u._id._id) ? u._id._id : u._id,
      username: u._id?.username || null,
      teamName: u._id?.teamName || null,
      latestCommitTimestamp: u.latestCommitTimestamp
    })),

    recentActivity: recentActivity.map(c => ({
      sha: c.sha,
      username: c.userId?.username || null,
      teamName: c.userId?.teamName || null,
      repo: c.repoFullName,
      message: c.message,
      timestamp: c.timestamp
    }))
  };
}

// small injector
const injectIo = (req, res, next) => {
  req.io = req.app && req.app.get('io') ? req.app.get('io') : (req.io || null);
  next();
};

router.post('/github', injectIo, express.json(), async (req, res) => {
  console.log('Webhook activated (simple mode).');

  const event = req.get('X-GitHub-Event') || req.get('x-github-event') || 'unknown';
  if (event === 'ping') return res.status(202).send('Ping received.');

  // respond fast to GitHub
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
          // robust timestamp extraction
          const commitDocs = commits.map(c => {
            // try different places for timestamp: top-level commit timestamp (varies by payload)
            const ts = c.timestamp || c.commit?.timestamp || payload.head_commit?.timestamp || null;
            return {
              userId: user._id,
              sha: c.id || c.sha || (c.commit && c.commit.id) || null,
              message: c.message || (c.commit && c.commit.message) || '',
              timestamp: ts ? new Date(ts) : new Date(), // fallback to now if absent (still better than undefined)
              repoFullName,
              authorName: c.author?.name || c.commit?.author?.name,
              authorEmail: c.author?.email || c.commit?.author?.email
            };
          }).filter(d => d.sha); // ensure sha exists

          // dedupe existing SHAs for that repo
          const shas = commitDocs.map(d => d.sha);
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

      // recompute and broadcast
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

// GET snapshot
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
