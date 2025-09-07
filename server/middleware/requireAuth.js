import jwt from "jsonwebtoken";
import User from "../models/User.js";

export async function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ error: "Missing auth header" });

    const token = auth.replace("Bearer ", "");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ error: "User not found" });

    req.user = user; // attach to request
    next();
  } catch (err) {
    console.error("Auth error:", err);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
