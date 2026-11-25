import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileTypeFromBuffer } from 'file-type';
import multer from 'multer';
import { z } from 'zod';
import { Site, Project, Post, User } from '../models/index.js';
import { roles, publicUser } from '../middleware/auth.js';
import { slugifyTitle } from '../utils/helpers.js';

const router = Router();
const edit = roles('owner', 'admin', 'editor');
const managePeople = roles('owner', 'admin');
const str = z.string().max(6000);
const short = z.string().max(300);
const urlField = z.string().max(2000).refine(v => !v || /^(https?:\/\/|\/[^/])/.test(v), 'Use an HTTPS URL or a local /path.');
const siteSchema = z.object({
  name: short, shortName: short, title: short,
  heroKicker: short, heroLine1: short, heroLine2: short, heroDescription: str,
  aboutHeading: short, aboutText: str, location: short, availability: short,
  email: z.union([z.literal(''), z.email()]), resumeUrl: urlField,
  heroImage: urlField, portraitImage: urlField,
  socials: z.object({ github: urlField, linkedin: urlField, website: urlField }),
  stats: z.array(z.object({ value: short, label: short })).max(8),
  skillGroups: z.array(z.object({ title: short, items: z.array(short).max(30) })).max(15),
  experience: z.array(z.object({ company: short, role: short, period: short, location: short, description: str })).max(30)
});
const projectSchema = z.object({
  title: z.string().min(2).max(160), slug: z.string().max(120).optional(), category: short,
  summary: z.string().max(450), description: str, stack: z.array(short).max(30),
  featured: z.boolean(), order: z.number().int().min(0).max(9999),
  accent: z.enum(['emerald', 'violet', 'blue', 'orange', 'rose']),
  imageUrl: urlField, links: z.object({ github: urlField, demo: urlField }),
  status: z.enum(['draft', 'published'])
});
const postSchema = z.object({
  title: z.string().min(2).max(180), slug: z.string().max(120).optional(),
  excerpt: z.string().max(500), body: z.string().max(150000),
  tags: z.array(short).max(20), coverImage: urlField,
  status: z.enum(['draft', 'published'])
});
function parse(schema, body) { return schema.safeParse(body); }
function invalid(res, result) { return res.status(400).json({ error: 'Invalid form data.', issues: result.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })) }); }
function wrap(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }
function databaseConflict(err) { return err.code === 11000; }

router.get('/overview', edit, wrap(async (_req, res) => {
  const [projects, posts, published, users, pending] = await Promise.all([
    Project.countDocuments(), Post.countDocuments(), Post.countDocuments({ status: 'published' }),
    User.countDocuments(), User.countDocuments({ status: 'pending' })
  ]);
  res.json({ projects, posts, published, users, pending });
}));
router.get('/site', edit, wrap(async (_req, res) => res.json({ site: await Site.findById('main').lean() })));
router.put('/site', edit, wrap(async (req, res) => {
  const parsed = parse(siteSchema, req.body);
  if (!parsed.success) return invalid(res, parsed);
  const site = await Site.findByIdAndUpdate('main', { $set: parsed.data }, { new: true, runValidators: true, upsert: true }).lean();
  res.json({ site });
}));
router.get('/projects', edit, wrap(async (_req, res) => res.json({ projects: await Project.find().sort({ order: 1 }).lean() })));
router.post('/projects', edit, wrap(async (req, res) => {
  const parsed = parse(projectSchema, req.body);
  if (!parsed.success) return invalid(res, parsed);
  const data = parsed.data;
  try {
    const project = await Project.create({ ...data, slug: slugifyTitle(data.slug || data.title) });
    res.status(201).json({ project });
  } catch (err) { if (databaseConflict(err)) return res.status(409).json({ error: 'That slug is already taken.' }); throw err; }
}));
router.put('/projects/:id', edit, wrap(async (req, res) => {
  const parsed = parse(projectSchema, req.body);
  if (!parsed.success) return invalid(res, parsed);
  try {
    const project = await Project.findByIdAndUpdate(req.params.id,
      { $set: { ...parsed.data, slug: slugifyTitle(parsed.data.slug || parsed.data.title) } }, { new: true, runValidators: true });
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    res.json({ project });
  } catch (err) { if (databaseConflict(err)) return res.status(409).json({ error: 'That slug is already taken.' }); throw err; }
}));
router.delete('/projects/:id', edit, wrap(async (req, res) => {
  const deleted = await Project.findByIdAndDelete(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Project not found.' });
  res.json({ ok: true });
}));
router.get('/posts', edit, wrap(async (_req, res) => res.json({ posts: await Post.find().sort({ updatedAt: -1 }).lean() })));
router.post('/posts', edit, wrap(async (req, res) => {
  const parsed = parse(postSchema, req.body);
  if (!parsed.success) return invalid(res, parsed);
  const data = parsed.data;
  try {
    const post = await Post.create({ ...data, slug: slugifyTitle(data.slug || data.title),
      publishedAt: data.status === 'published' ? new Date() : null });
    res.status(201).json({ post });
  } catch (err) { if (databaseConflict(err)) return res.status(409).json({ error: 'That slug is already taken.' }); throw err; }
}));
router.put('/posts/:id', edit, wrap(async (req, res) => {
  const parsed = parse(postSchema, req.body);
  if (!parsed.success) return invalid(res, parsed);
  try {
    const old = await Post.findById(req.params.id);
    if (!old) return res.status(404).json({ error: 'Article not found.' });
    const data = parsed.data;
    Object.assign(old, data, { slug: slugifyTitle(data.slug || data.title),
      publishedAt: data.status === 'published' ? (old.publishedAt || new Date()) : null });
    await old.save();
    res.json({ post: old });
  } catch (err) { if (databaseConflict(err)) return res.status(409).json({ error: 'That slug is already taken.' }); throw err; }
}));
router.delete('/posts/:id', edit, wrap(async (req, res) => {
  const deleted = await Post.findByIdAndDelete(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Article not found.' });
  res.json({ ok: true });
}));
router.get('/users', managePeople, wrap(async (_req, res) => {
  const users = await User.find().sort({ createdAt: 1 }).lean();
  res.json({ users: users.map(u => ({ ...publicUser(u), createdAt: u.createdAt, lastLoginAt: u.lastLoginAt })) });
}));
router.patch('/users/:id', managePeople, wrap(async (req, res) => {
  const parsed = z.object({ role: z.enum(['admin', 'editor', 'viewer']), status: z.enum(['pending', 'active', 'disabled']) }).safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed);
  const target = await User.findById(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found.' });
  if (target.role === 'owner') return res.status(403).json({ error: 'The original owner cannot be changed.' });
  if (req.user.role !== 'owner' && (target.role === 'admin' || parsed.data.role === 'admin'))
    return res.status(403).json({ error: 'Only the owner can grant or edit admin accounts.' });
  if (String(target._id) === String(req.user._id))
    return res.status(403).json({ error: 'You cannot change your own account here.' });
  target.role = parsed.data.role;
  target.status = parsed.data.status;
  target.sessionVersion += 1; // immediately revoke sessions after role/status changes
  await target.save();
  res.json({ user: publicUser(target) });
}));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024, files: 1 } });
const allowedTypes = new Map([['image/jpeg', 'jpg'], ['image/png', 'png'], ['image/webp', 'webp']]);
router.post('/upload', edit, upload.single('image'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a JPG, PNG or WebP image.' });
  const type = await fileTypeFromBuffer(req.file.buffer);
  const ext = allowedTypes.get(type?.mime);
  if (!ext) return res.status(400).json({ error: 'The uploaded image type is not allowed.' });
  const fileName = `${randomUUID()}.${ext}`;
  const directory = new URL('../../uploads/', import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL(fileName, directory), req.file.buffer, { flag: 'wx' });
  res.status(201).json({ url: `/uploads/${fileName}` });
}));
export default router;
