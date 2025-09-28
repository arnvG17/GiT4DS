// routes/webhook.js
import express from "express";
import User from "../models/User.js";
import Commit from "../models/Commit.js";

const router = express.Router();

// Simple Socket.IO injection helper (uses injected io if present)
const injectIo = (req, res, next) => {
  req.io = req.io || ioPlaceholder;
  next();
};

const ioPlaceholder = {
  emit: (event, data) => console.log(`[Socket.IO Broadcast] (placeholder) Emitting: ${event}`, data),
};

// --- Leaderboard helper ---
const calculateAndFetchLeaderboardData = async () => {
  const commitCounts = await Commit.aggregate([
    { $group: { _id: "$userId", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ]);

  const firstCommits = await Commit.aggregate([
    { $group: { _id: "$userId", firstCommitTimestamp: { $min: "$timestamp" } } },
    { $sort: { firstCommitTimestamp: 1 } },
  ]);

  const usersWithCounts = await User.populate(commitCounts, { path: "_id", select: "username teamName" });
  const usersWithFirstCommits = await User.populate(firstCommits, { path: "_id", select: "teamName" });

  const recentActivity = await Commit.find()
    .sort({ timestamp: -1 })
    .limit(5)
    .populate("userId", "username teamName")
    .lean();

  return {
    totalCommits: usersWithCounts.map(u => ({ username: u._id.username, teamName: u._id.teamName, count: u.count })),
    firstCommitRankings: usersWithFirstCommits.map(u => ({ teamName: u._id.teamName, firstCommitTimestamp: u.firstCommitTimestamp })),
    recentActivity: recentActivity.map(c => ({ username: c.userId.username, repo: c.repoFullName, message: c.message, timestamp: c.timestamp })),
  };
};

// --- Simple webhook route (no signature checking) ---
// Use express.json() here so this route expects JSON payloads
router.post("/github", injectIo, express.json(), async (req, res) => {
  const io = req.io;
  console.log("Webhook activated (simple mode).");

  const event = req.get("X-GitHub-Event") || req.get("x-github-event") || "unknown";

  // Quick ping response
  if (event === "ping") {
    console.log("Received GitHub 'ping' event. Acknowledging.");
    return res.status(202).send("Ping received.");
  }

  // Accept and respond quickly
  res.status(202).send(`Webhook accepted for event: ${event}. Processing in background.`);

  // Background processing
  (async () => {
    try {
      const payload = req.body || {};
      const repoFullName = payload.repository?.full_name || payload.repository?.fullName || null;

      if (!repoFullName) {
        console.warn("Webhook payload missing repository info - skipping.");
        return;
      }

      // Find user with this repo registered
      const user = await User.findOne({ "activeWebhooks.repoFullName": repoFullName });
      if (!user) {
        console.warn(`No registered user for repo: ${repoFullName}.`);
        return;
      }

      if (event === "push") {
        const commits = payload.commits || [];
        if (commits.length === 0) {
          console.log(`Push for ${repoFullName} had no commits.`);
        } else {
          const commitInserts = commits.map(c => ({
            userId: user._id,
            sha: c.id || c.sha,
            message: c.message,
            timestamp: c.timestamp ? new Date(c.timestamp) : new Date(),
            repoFullName,
            authorName: c.author?.name || c.commit?.author?.name,
            authorEmail: c.author?.email || c.commit?.author?.email,
          }));

          await Commit.insertMany(commitInserts);
          console.log(`Stored ${commits.length} commits for ${repoFullName}.`);
        }
      } else {
        console.log(`Received non-push event '${event}' for ${repoFullName} (ignored for commit insert).`);
      }

      // Recalculate and broadcast leaderboard
      const currentLeaderboard = await calculateAndFetchLeaderboardData();
      io.emit("leaderboard:update", currentLeaderboard);
      console.log("Broadcasted leaderboard:update.");
    } catch (err) {
      console.error("Error processing webhook (simple mode):", err);
    }
  })();
});

export default router;
