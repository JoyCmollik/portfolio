import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const userSchema = new Schema({
  googleId: { type: String, required: true, unique: true, immutable: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  name: { type: String, default: '' }, avatar: { type: String, default: '' },
  role: { type: String, enum: ['owner', 'admin', 'editor', 'viewer'], default: 'viewer' },
  status: { type: String, enum: ['pending', 'active', 'disabled'], default: 'pending' },
  sessionVersion: { type: Number, default: 0 },
  lastLoginAt: { type: Date, default: Date.now }
}, { timestamps: true });
export const User = model('User', userSchema);

const ownershipSchema = new Schema({ _id: { type: String }, userId: { type: Schema.Types.ObjectId, ref: 'User', required: true } }, { timestamps: true });
export const Ownership = model('Ownership', ownershipSchema);

const skillGroupSchema = new Schema({ title: String, items: [String] }, { _id: false });
const experienceSchema = new Schema({ company: String, role: String, period: String, location: String, description: String }, { _id: false });
const statSchema = new Schema({ value: String, label: String }, { _id: false });
const siteSchema = new Schema({
  _id: { type: String, default: 'main' }, name: String, shortName: String, title: String,
  heroKicker: String, heroLine1: String, heroLine2: String, heroDescription: String,
  aboutHeading: String, aboutText: String, location: String, availability: String,
  email: String, resumeUrl: String, heroImage: String, portraitImage: String,
  socials: { github: { type: String, default: '' }, linkedin: { type: String, default: '' }, website: { type: String, default: '' } },
  stats: [statSchema], skillGroups: [skillGroupSchema], experience: [experienceSchema]
}, { timestamps: true });
export const Site = model('Site', siteSchema);

const projectSchema = new Schema({
  title: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true },
  category: String, summary: String, description: String, stack: [String],
  featured: { type: Boolean, default: false }, order: { type: Number, default: 0 },
  accent: { type: String, enum: ['emerald', 'violet', 'blue', 'orange', 'rose'], default: 'blue' },
  imageUrl: { type: String, default: '' },
  links: { github: { type: String, default: '' }, demo: { type: String, default: '' } },
  status: { type: String, enum: ['draft', 'published'], default: 'draft' }
}, { timestamps: true });
export const Project = model('Project', projectSchema);

const postSchema = new Schema({
  title: { type: String, required: true, trim: true }, slug: { type: String, required: true, unique: true, lowercase: true },
  excerpt: String, body: String, tags: [String], coverImage: { type: String, default: '' },
  status: { type: String, enum: ['draft', 'published'], default: 'draft' },
  publishedAt: { type: Date, default: null }
}, { timestamps: true });
export const Post = model('Post', postSchema);
