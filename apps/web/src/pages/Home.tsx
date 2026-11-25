/**
 * Home: hero -> tech marquee -> numbers -> selected work (sticky stack) -> about statement
 * -> toolkit bento -> notebook -> contact. Every section lives in components/home/*.
 */
import '../components/home/home.css';
import { ContactSection } from '../components/SiteShell';
import { Hero } from '../components/home/Hero';
import { TechMarquee } from '../components/home/TechMarquee';
import { Stats } from '../components/home/Stats';
import { WorkStack } from '../components/home/WorkStack';
import { AboutStatement } from '../components/home/AboutStatement';
import { Toolkit } from '../components/home/Toolkit';
import { WritingList } from '../components/home/WritingList';

export default function Home() {
  return (
    <div className="home">
      <Hero />
      <TechMarquee />
      <Stats />
      <WorkStack />
      <AboutStatement />
      <Toolkit />
      <WritingList />
      <ContactSection />
    </div>
  );
}
