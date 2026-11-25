import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { User, Ownership } from '../models/index.js';
import { COOKIE_NAME, cookieOptions, createSession, publicUser } from '../middleware/auth.js';
const router = Router();
const client = new OAuth2Client();

router.get('/me', (req, res) => res.json({ user: req.user ? publicUser(req.user) : null }));
router.post('/google', async (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) return res.status(503).json({ error: 'Google Sign-In is not configured.' });
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
    return res.status(503).json({ error: 'Session secret must be at least 32 characters.' });
  const credential = req.body?.credential;
  if (typeof credential !== 'string' || credential.length > 10000)
    return res.status(400).json({ error: 'A valid Google credential is required.' });
  let identity;
  try {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
    identity = ticket.getPayload();
  } catch { return res.status(401).json({ error: 'Google identity verification failed.' }); }
  if (!identity?.sub || !identity.email || !identity.email_verified)
    return res.status(401).json({ error: 'A verified Google email is required.' });
  const email = identity.email.toLowerCase();
  let user = await User.findOneAndUpdate({ googleId: identity.sub }, {
    $set: { email, name: identity.name || '', avatar: identity.picture || '', lastLoginAt: new Date() },
    $setOnInsert: { status: 'pending', role: 'viewer' }
  }, { upsert: true, new: true, setDefaultsOnInsert: true });

  // Unique _id makes the initial owner claim atomic, even under concurrent logins.
  let owner = await Ownership.findById('owner');
  if (!owner) {
    const allowedEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
    if (!allowedEmail && process.env.NODE_ENV === 'production')
      return res.status(503).json({ error: 'Set BOOTSTRAP_ADMIN_EMAIL before enabling production sign-in.' });
    if (!allowedEmail || allowedEmail === email) {
      try { owner = await Ownership.create({ _id: 'owner', userId: user._id }); }
      catch (err) { if (err.code !== 11000) throw err; owner = await Ownership.findById('owner'); }
    }
  }
  if (owner && String(owner.userId) === String(user._id)) {
    user = await User.findByIdAndUpdate(user._id, { $set: { role: 'owner', status: 'active' } }, { new: true });
  }
  res.cookie(COOKIE_NAME, createSession(user), cookieOptions());
  res.json({ user: publicUser(user) });
});
router.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
  res.json({ ok: true });
});
export default router;
