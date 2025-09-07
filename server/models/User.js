import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  
  username: String,
  githubAccessToken: String,
  teamName: String,
  selectedRepo: String,
  selectedCommit: String,
  metadata: String,
  repos: {type: Object, default: {}}
  ,
});

export default mongoose.model("User", userSchema);
