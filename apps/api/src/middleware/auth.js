import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';
import { publicUser } from '../utils/helpers.js';
export const COOKIE_NAME = 'joy_session';
export const cookieOptions = () => ({
  httpOnly: true, secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax', path: '/', maxAge: 7 * 24 * 60 * 60 * 1000
});
export function createSession(user) {
  return jwt.sign({ sub: String(user._id), v: user.sessionVersion }, process.env.SESSION_SECRET, { expiresIn: '7d' });
}
export async function optionalAuth(req, _res, next) {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) return next();
    const decoded = jwt.verify(token, process.env.SESSION_SECRET);
    const user = await User.findById(decoded.sub);
    if (user && user.sessionVersion === decoded.v) req.user = user;
  } catch { /* Not signed in. */ }
  next();
}
export function signedIn(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sign in with Google first.' });
  next();
}
export function roles(...allowed) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Sign in required.' });
    if (req.user.status !== 'active' || !allowed.includes(req.user.role))
      return res.status(403).json({ error: 'You do not have access to this area.' });
    next();
  };
}
export { publicUser };
