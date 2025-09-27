// config/passport.js
import passport from "passport";
import { Strategy as GitHubStrategy } from "passport-github2";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((obj, done) => {
  done(null, obj);
});

// ------------------
// GitHub Strategy
// ------------------
passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: "https://git4ds.onrender.com/auth/github/callback",
    },
    (accessToken, refreshToken, profile, done) => {
      // Attach token + profile so we can call GitHub API later
      const user = {
        id: profile.id,
        username: profile.username,
        displayName: profile.displayName,
        provider: "github",
        githubAccessToken: accessToken,
        profile,
      };
      return done(null, user);
    }
  )
);

// ------------------
// Google Strategy
// ------------------
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "https://git4ds.onrender.com/auth/google/callback",
    },
    (accessToken, refreshToken, profile, done) => {
      const user = {
        id: profile.id,
        displayName: profile.displayName,
        provider: "google",
        profile,
      };
      return done(null, user);
    }
  )
);

export default passport;
