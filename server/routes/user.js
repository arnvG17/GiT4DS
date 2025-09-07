// routes/user.js
import express from "express";
import User from "../models/User.js";

const router = express.Router();

// POST /user/data
router.post("/data", async (req, res) => {
  try {
    const { teamName } = req.body;
    if (!teamName) return res.status(400).json({ error: "teamName required" });

    const user = await User.findOne({ teamName }).lean();
    if (!user) return res.status(404).json({ error: "User not found" });

    // send the whole user object (or pick only what you need)
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/submit", async (req, res) => {
  try {
    console.log(req.body)
    const { teamName ,repoUrl, description } = req.body;
    const user = await User.findOne({ teamName });
    if (!user) return res.status(404).json({ error: "User not found" });

    // push to repos array or update
    user.selectedRepo=repoUrl;
    user.metadata=description
    await user.save();

    res.json({ message: "Repo saved", repo: { repoUrl, description } });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
