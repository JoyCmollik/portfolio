/**
 * fx: motion & atmosphere primitives for the public site (spec section 5).
 * Import everything from here:  import { RevealText, Reveal, Magnetic } from '../components/fx';
 */
import './fx.css';

export { SmoothScroll, useLenis, scrollToTarget, stopScroll, startScroll } from './SmoothScroll';
export type { SmoothScrollProps, ScrollTargetOptions } from './SmoothScroll';
export { Cursor } from './Cursor';
export { Magnetic } from './Magnetic';
export type { MagneticProps } from './Magnetic';
export { RevealText } from './RevealText';
export type { RevealTextProps } from './RevealText';
export { Reveal, Stagger, StaggerItem } from './Reveal';
export type { RevealProps, StaggerProps, StaggerItemProps, RevealTag, RevealTrigger } from './Reveal';
export { ScrollHighlight } from './ScrollHighlight';
export type { ScrollHighlightProps } from './ScrollHighlight';
export { Counter } from './Counter';
export type { CounterProps } from './Counter';
export { Marquee } from './Marquee';
export type { MarqueeProps } from './Marquee';
export { useSpotlight } from './spotlight';
export { Tilt } from './Tilt';
export type { TiltProps } from './Tilt';
export { ScrollProgress } from './ScrollProgress';
export type { ScrollProgressProps } from './ScrollProgress';
export { RollText } from './RollText';
export type { RollTextProps } from './RollText';
export { TextScramble } from './TextScramble';
export type { TextScrambleProps } from './TextScramble';
export { LocalTime } from './LocalTime';
export type { LocalTimeProps } from './LocalTime';
export { Preloader } from './Preloader';
export type { PreloaderProps } from './Preloader';
export { AmbientLayer } from './AmbientLayer';
export { ShaderBackdrop } from './ShaderBackdrop';
