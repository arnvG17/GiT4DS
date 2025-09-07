import validator from 'validator';

export function isValidGitUrl(url) {
  if (!url || typeof url !== 'string') return false;
  // basic URL check
  if (!validator.isURL(url, { protocols: ['http','https'], require_protocol: true })) return false;
  // Accept github.com or gitlab.com format (owner/repo or owner/repo.git)
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (!host.includes('github.com') && !host.includes('gitlab.com')) return false;
    // path must be /owner/repo
    const parts = u.pathname.replace(/(^\/|\.git$)/g, '').split('/').filter(Boolean);
    return parts.length >= 2;
  } catch (err) {
    return false;
  }
}

export function detectProvider(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host.includes('github.com')) return 'github';
    if (host.includes('gitlab.com')) return 'gitlab';
    return null;
  } catch (err) {
    return null;
  }
}
