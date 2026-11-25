import { readFile } from 'node:fs/promises';
import { Site, Project, Post } from '../models/index.js';

export async function seedContentIfEmpty() {
  const seed = JSON.parse(await readFile(new URL('../../../../content/seed.json', import.meta.url), 'utf8'));
  if (!await Site.exists({ _id: 'main' })) await Site.create({ _id: 'main', ...seed.site });
  if (!await Project.exists({})) await Project.insertMany(seed.projects);
  if (!await Post.exists({})) await Post.insertMany(seed.posts);
  console.info('[seed] Portfolio content is ready. Existing content is preserved.');
}
