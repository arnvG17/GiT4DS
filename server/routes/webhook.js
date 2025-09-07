import express from 'express';
import crypto from 'crypto';
import Repo from '../models/Repo.js';

const router = express.Router();

// GitHub webhook endpoint
router.post('/github', express.json({ type: '*/*' }), async (req, res) => {
  const sig = req.headers['x-hub-signature-256'];
  const secret = process.env.GITHUB_WEBHOOK_SECRET || '';
  const payload = JSON.stringify(req.body);
  if (secret && sig) {
    const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const expected = `sha256=${hmac}`;
    try {
      if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
    } catch (e) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }
  try {
    const event = req.headers['x-github-event'];
    if (event === 'push') {
      const repoFull = req.body.repository && req.body.repository.full_name;
      const commit = req.body.head_commit || req.body.after;
      const sha = typeof commit === 'string' ? commit : (commit && commit.id) || null;
      const date = (commit && commit.timestamp) ? new Date(commit.timestamp) : new Date();
      if (repoFull && sha) {
        // Find matching repo by repoName or repoUrl contains repoFull
        const candidates = await Repo.find({ $or: [{ repoName: repoFull }, { repoUrl: { $regex: repoFull, $options: 'i' } }] });
        for (const r of candidates) {
          r.latestCommitSha = sha;
          r.latestCommitAt = date;
          await r.save();
          const io = req.app.get('io');
          if (io) io.emit('repo:update', { repoId: r._id, latestCommitSha: sha, latestCommitAt: date });
        }
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

export default router;
