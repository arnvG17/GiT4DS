// routes/repos.js
import express from "express";
import jwt from "jsonwebtoken";
import axios from "axios";
import User from "../models/User.js";

const router = express.Router();

// Auth middleware
const auth = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: "No token" });

  try {
    const token = header.split(" ")[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(payload.id);
    if (!req.user) return res.status(404).json({ error: "User not found" });
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

// Get saved repos
router.get("/repos", auth, (req, res) => {
  res.json({ repos: req.user.repos || [] });
});

// Save selected repo
router.post("/repos", auth, async (req, res) => {
  const { repoUrl, description } = req.body;
  const newRepo = { repoUrl, description, latestCommitSha: "" };
  req.user.repos = [newRepo];
  await req.user.save();
  res.json({ repo: newRepo });
});

// Get user GitHub repos
router.get("/repos/github", auth, async (req, res) => {
  try {
    const ghRes = await axios.get("https://api.github.com/user/repos?per_page=100", {
      headers: { Authorization: `Bearer ${req.user.githubAccessToken}` },
    });
    res.json({ repos: ghRes.data });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch GitHub repos" });
  }
});

export default router;
