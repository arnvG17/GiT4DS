import mongoose from "mongoose";

const commitSchema = new mongoose.Schema({
    // Link to the User who made the commit
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', 
        required: true
    },
    
    // Data about the commit itself
    sha: { type: String, required: true, unique: true }, // Commit hash
    message: { type: String, required: true },
    timestamp: { type: Date, required: true, index: true }, // Critical for "first commit" and "recent commits"

    // Repository information
    repoFullName: { type: String, required: true, index: true }, // e.g., "owner/repo"

    // Author details
    authorName: { type: String },
    authorEmail: { type: String }
});

export default mongoose.model("Commit", commitSchema);
