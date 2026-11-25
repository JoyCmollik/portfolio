export type Role = 'owner' | 'admin' | 'editor' | 'viewer';
export type AccountStatus = 'pending' | 'active' | 'disabled';
export type PublicationStatus = 'draft' | 'published';
export interface User { id: string; name: string; email: string; avatar: string; role: Role; status: AccountStatus; createdAt?: string; lastLoginAt?: string }
export interface SkillGroup { title: string; items: string[] }
export interface Experience { company: string; role: string; period: string; location: string; description: string }
export interface Site {
  name: string; shortName: string; title: string; heroKicker: string; heroLine1: string; heroLine2: string;
  heroDescription: string; aboutHeading: string; aboutText: string; location: string; availability: string;
  email: string; resumeUrl: string; heroImage: string; portraitImage: string;
  socials: { github: string; linkedin: string; website: string };
  stats: { value: string; label: string }[]; skillGroups: SkillGroup[]; experience: Experience[];
}
export interface Project {
  _id?: string; title: string; slug: string; category: string; summary: string; description: string;
  stack: string[]; featured: boolean; order: number; accent: 'emerald' | 'violet' | 'blue' | 'orange' | 'rose';
  imageUrl: string; links: { github: string; demo: string }; status: PublicationStatus;
}
export interface Post {
  _id?: string; title: string; slug: string; excerpt: string; body: string; tags: string[];
  coverImage: string; status: PublicationStatus; publishedAt?: string | null; updatedAt?: string;
}
export interface PortfolioContent { site: Site; projects: Project[]; posts: Post[] }
