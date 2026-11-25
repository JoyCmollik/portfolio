import { Router } from 'express';
import { Site, Project, Post } from '../models/index.js';
const router = Router();
router.get('/content', async (_req, res) => {
  const [site, projects, posts] = await Promise.all([
    Site.findById('main').lean(),
    Project.find({ status: 'published' }).sort({ order: 1, createdAt: -1 }).lean(),
    Post.find({ status: 'published' }).sort({ publishedAt: -1 }).lean()
  ]);
  res.json({ site, projects, posts });
});
router.get('/posts/:slug', async (req, res) => {
  const post = await Post.findOne({ slug: req.params.slug, status: 'published' }).lean();
  if (!post) return res.status(404).json({ error: 'Article not found.' });
  res.json({ post });
});
export default router;
