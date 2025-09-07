import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import User from '../models/User.js';


dotenv.config();


export const requireAuth = async (req, res, next) => {
const h = req.headers.authorization;
if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' });
const token = h.split(' ')[1];
try {
const payload = jwt.verify(token, process.env.JWT_SECRET);
const user = await User.findById(payload.id).select('-passwordHash');
if (!user) return res.status(401).json({ error: 'Invalid token user' });
req.user = { id: user._id, role: user.role, teamName: user.teamName };
next();
} catch (err) {
return res.status(401).json({ error: 'Invalid token' });
}
};


export const requireAdmin = (req, res, next) => {
if (!req.user) return res.status(401).json({ error: 'Missing auth' });
if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
next();
};