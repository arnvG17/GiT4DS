import express from "express";
import axios from "axios";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import User from "../models/User.js";

dotenv.config();
const router = express.Router();
let teamName = "";

// ------------------
// GitHub OAuth
// ------------------
router.get("/github", (req, res) => {
  teamName = req.query.teamName;
  console.log(teamName);
  


  const redirect = `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&scope=repo,user:email&redirect_uri=https://git4ds.onrender.com/auth/github/callback`;
  res.redirect(redirect); 
});

router.get("/github/callback", async (req, res) => {
  console.log(req.query);
  const code = req.query.code;
  console.log(code);
  if (!code) return res.status(400).json({ error: "No code" });

  try {
    const tokenRes = await axios.post(
      "https://github.com/login/oauth/access_token",
      {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      },
      { headers: { Accept: "application/json" } }
    );


    const ghAccessToken = tokenRes.data.access_token;
    console.log(ghAccessToken);

    let user = await User.findOne({ githubAccessToken: ghAccessToken });
    if (!user) {
      user = await User.create({ githubAccessToken: ghAccessToken });
    }

    user.teamName = teamName;
    await user.save();



    if (!ghAccessToken) return res.status(400).json({ error: "No GitHub token" });

    const userReposRes = await axios.get('https://api.github.com/user/repos', {
      headers: {
        'Authorization': `Bearer ${ghAccessToken}`,
        'Accept': 'application/vnd.github+json'
      },
      params: {
        sort: 'pushed',      // Sort by latest pushed
        direction: 'desc',   // Descending order, so latest is first
        // Add other query params as needed: visibility, affiliation, type, etc.
      }
    });
   
    user.githubAccessToken = ghAccessToken;

    user.repos = userReposRes.data;
    await user.save();

    const repos = userReposRes.data;
    


    const getUsername = async (ghAccessToken) => {
      const response = await axios.get('https://api.github.com/user', {
        headers: { 'Authorization': `Bearer ${ghAccessToken}` }
      });
      console.log(response.data);
      user.username = response.data.login;
      console.log(user.username);
      await user.save();


      return ghAccessToken; // 'login' is the username
    };
    


    

    

    const redirect = `${process.env.FRONTEND_ORIGIN}/user`;
    res.redirect(redirect);
  } catch (err) {
    console.error(err);
    res.redirect(`${process.env.FRONTEND_ORIGIN}/login?error=github`);
  }
});

// ------------------
// Google OAuth
// ------------------
router.get("/google", (req, res) => {
  const redirect = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.GOOGLE_CLIENT_ID}&redirect_uri=${process.env.BACKEND_ORIGIN}/auth/google/callback&response_type=code&scope=openid%20email%20profile&access_type=offline&prompt=consent`;
  res.redirect(redirect);
});

router.get("/google/callback", async (req, res) => {
  const code = req.query.code;
  console.log("google code", code); 
  if (!code) return res.status(400).json({ error: "No code" });

  try {
    // Exchange code for tokens
    const tokenRes = await axios.post(
      "https://oauth2.googleapis.com/token",
      {
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${process.env.BACKEND_ORIGIN}/auth/google/callback`,
      },
      { headers: { "Content-Type": "application/json" } }
    );

    const accessToken = tokenRes.data.access_token;
    console.log("google ACCTOK",accessToken);
    const idToken = tokenRes.data.id_token;



    // Decode user info from Google userinfo endpoint
    const userRes = await axios.get("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const user = userRes.data;

    const jwtToken = jwt.sign(
      { id: user.sub, email: user.email, name: user.name, provider: "google", googleAccessToken: accessToken },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const redirect = `${process.env.FRONTEND_ORIGIN}/admin`;
    res.redirect(redirect);
  } catch (err) {
    console.error(err);
    res.redirect(`${process.env.FRONTEND_ORIGIN}/admin`);
  }
});

export default router;
