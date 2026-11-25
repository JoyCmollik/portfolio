import seed from '../../../../content/seed.json';
import type { PortfolioContent } from '../types';
// Offline preview data only. Production content comes from MongoDB.
export const demoContent = seed as unknown as PortfolioContent;
