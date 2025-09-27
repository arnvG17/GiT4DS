import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    // --- Existing Fields ---
    username: String,
    githubAccessToken: String, // ESSENTIAL for making GitHub API calls
    teamName: String,
    selectedRepo: String, // Used for the current submitted repo URL
    selectedCommit: String,
    metadata: String,       // Used for the submission description
    repos: { type: Object, default: {} }, // Kept for existing flexibility, but 'activeWebhooks' is better structured

    // --- New/Updated Fields for Webhook Management ---
    activeWebhooks: { 
        type: [new mongoose.Schema({
            repoUrl: String,           // The full URL the user submitted
            repoFullName: String,      // e.g., "owner/repo"
            webhookSecret: String,     // CRITICAL: Used to verify incoming webhook payloads
            webhookId: Number,         // The ID GitHub assigned to this hook (for deletion/update)
            description: String        // The submission metadata/description
        }, { _id: false })],
        default: []
    }
});

export default mongoose.model("User", userSchema);