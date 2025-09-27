import express from "express";
import User from "../models/User.js";
import axios from "axios";
import crypto from "crypto";

const router = express.Router();

// 💡 Configuration: Update this to your public server endpoint for webhooks!
const WEBHOOK_PAYLOAD_URL = "https://git4ds.onrender.com/webhook/github";

// --- Helper Functions (Webhook Setup) ---

/**
 * Generates a strong random string for the webhook secret.
 */
const generateWebhookSecret = () => {
    return crypto.randomBytes(20).toString('hex');
};

/**
 * Parses a GitHub URL to get the owner and repo name.
 * e.g., 'https://github.com/owner/repo.git' -> { owner: 'owner', repo: 'repo', fullName: 'owner/repo' }
 */
const parseGitHubRepoUrl = (url) => {
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)(\.git)?$/i);
    if (match && match[1] && match[2]) {
        const owner = match[1];
        const repo = match[2];
        return {
            owner,
            repo,
            fullName: `${owner}/${repo}`
        };
    }
    return null;
};

/**
 * Calls the GitHub API to create a webhook for a given repository.
 * 💡 The events array is updated to track PUSH (commits), STATUS (commit checks), and CREATE (new branches/tags).
 */
const createGitHubWebhook = async (accessToken, repoDetails, secret) => {
    const { owner, repo } = repoDetails;
    const GITHUB_API_URL = `https://api.github.com/repos/${owner}/${repo}/hooks`;
    
    const payload = {
        name: "web",
        config: {
            url: WEBHOOK_PAYLOAD_URL,
            content_type: "json",
            secret: secret,
            insecure_ssl: "0"
        },
        // 💡 UPDATED: Added 'status' and 'create' events for broader change tracking
        events: ["push", "status", "create"],
        active: true
    };

    try {
        const response = await axios.post(GITHUB_API_URL, payload, {
            headers: {
                Authorization: `token ${accessToken}`,
                Accept: 'application/vnd.github.v3+json',
                'Content-Type': 'application/json'
            }
        });
        
        return response.data.id; // Returns the webhook ID from GitHub
    } catch (error) {
        console.error("GitHub Webhook Creation Failed:", error.response?.data || error.message);
        throw new Error("Failed to create GitHub webhook. Check permissions or repository existence.");
    }
};

// --- Routes ---

// POST /user/data (Fetch user data)
router.post("/data", async (req, res) => {
    try {
        const { teamName } = req.body;
        if (!teamName) return res.status(400).json({ error: "teamName required" });

        const user = await User.findOne({ teamName }).lean();
        if (!user) return res.status(404).json({ error: "User not found" });

        res.json(user);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});

// POST /user/submit (Handles repo submission and webhook creation)
router.post("/submit", async (req, res) => {
    try {
        const { teamName, repoUrl, description } = req.body;
        const user = await User.findOne({ teamName });

        if (!user) return res.status(404).json({ error: "User not found" });

        // 1. Validation and Parsing
        const repoDetails = parseGitHubRepoUrl(repoUrl);
        if (!repoDetails) {
            return res.status(400).json({ error: "Invalid GitHub repository URL format." });
        }
        if (!user.githubAccessToken) {
            return res.status(401).json({ error: "User must be authenticated with GitHub (missing access token)." });
        }
        
        // Check if a webhook for this repo already exists
        const existingHook = user.activeWebhooks.find(h => h.repoFullName === repoDetails.fullName);
        if (existingHook) {
             // NOTE: If a webhook is being re-submitted, you might want logic here 
             // to DELETE the old hook on GitHub and create a new one to ensure 
             // the events array is up to date, but for now, we assume it's set correctly.
             return res.status(200).json({ 
                 message: "Repository already submitted and webhook is active.", 
                 repo: { repoUrl, description, webhookId: existingHook.webhookId }
             });
        }

        // 2. Generate Secret and Create Webhook
        const webhookSecret = generateWebhookSecret();
        
        // --- THIS IS THE CRITICAL STEP THAT CALLS THE GITHUB API ---
        const webhookId = await createGitHubWebhook(
            user.githubAccessToken,
            repoDetails,
            webhookSecret
        );
        // ----------------------------------------------------------

        // 3. Save User Data and Webhook ID
        user.selectedRepo = repoUrl;
        user.metadata = description;
        
        user.activeWebhooks.push({
            repoUrl: repoUrl,
            repoFullName: repoDetails.fullName,
            webhookSecret: webhookSecret,
            webhookId: webhookId,
            description: description
        });
        
        await user.save();

        res.json({ 
            message: "Repo saved and GitHub webhook successfully created! Tracking enabled.", 
            repo: { repoUrl, description, webhookId } 
        });
    } catch (err) {
        console.error("Error in /user/submit:", err);
        const status = err.message.includes("GitHub webhook") ? 403 : 500;
        res.status(status).json({ error: err.message || "Server error during submission." });
    }
});

export default router;
