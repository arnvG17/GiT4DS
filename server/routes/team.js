// routes/admin.js
import express from "express";
import User from "../models/User.js";

const router = express.Router();

// GET /admin/selected-repos
router.get("/selected-repos", async (req, res) => {
  try {
    // fetch only teamName and selectedRepo from all users
    const users = await User.find({}, "teamName selectedRepo").lean();

    // users will look like: [ { _id, teamName, selectedRepo }, ... ]
    res.json({ users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
