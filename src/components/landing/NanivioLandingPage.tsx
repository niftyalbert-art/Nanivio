import React, { useState } from "react";
import { ArrowDown, ArrowUpRight, Menu, X } from "lucide-react";
import { NanivioLogo } from "../common/NanivioLogo";
import "./NanivioLandingPage.css";

type NanivioLandingPageProps = {
  onSignIn: () => void;
  onGetStarted: () => void;
};

const wirePoints: Array<[number, number]> = [
  [220, 45], [102, 100], [338, 100], [55, 213], [385, 213],
  [220, 176], [220, 318], [102, 276], [338, 276], [220, 108],
];

const connections: Array<[number, number]> = [
  [0, 1], [0, 2], [1, 3], [2, 4], [3, 6], [4, 6], [1, 5], [2, 5],
  [3, 5], [4, 5], [5, 6], [1, 7], [2, 8], [7, 6], [8, 6], [0, 5],
  [9, 1], [9, 2], [9, 3], [9, 4], [9, 6], [7, 5], [8, 5], [0, 3],
  [0, 4], [3, 8], [4, 7],
];

function LuminousNetwork() {
  return (
    <svg className="nl-network" viewBox="0 0 440 365" role="img" aria-label="A luminous gold network of connected points">
      <defs>
        <linearGradient id="nl-gold-line" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f8e8b2" stopOpacity=".98" />
          <stop offset=".48" stopColor="#bd9652" stopOpacity=".58" />
          <stop offset="1" stopColor="#f3d78f" stopOpacity=".9" />
        </linearGradient>
        <radialGradient id="nl-node-glow">
          <stop stopColor="#fff8df" />
          <stop offset=".23" stopColor="#e9c676" />
          <stop offset="1" stopColor="#e9c676" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="nl-reflection" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#d8b76d" stopOpacity=".22" />
          <stop offset="1" stopColor="#d8b76d" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g className="nl-network-lines">
        {connections.map(([from, to], index) => {
          const a = wirePoints[from];
          const b = wirePoints[to];
          return <line key={`${from}-${to}-${index}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />;
        })}
        <path className="nl-orbit" d="M53 211 220 44 387 211 220 319 53 211Z" />
        <path className="nl-orbit nl-orbit-inner" d="M102 100 338 276 338 100 102 276 102 100Z" />
      </g>
      <g className="nl-network-reflection" transform="translate(0 638) scale(1 -1)">
        {connections.slice(0, 18).map(([from, to], index) => {
          const a = wirePoints[from];
          const b = wirePoints[to];
          return <line key={`reflection-${index}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />;
        })}
      </g>
      <g className="nl-network-nodes">
        {wirePoints.map(([cx, cy], index) => (
          <g key={index}>
            <circle className="nl-node-aura" cx={cx} cy={cy} r={index === 0 || index === 6 ? 17 : 12} />
            <circle className="nl-node" cx={cx} cy={cy} r={index === 0 || index === 6 ? 3.2 : 2.4} />
          </g>
        ))}
      </g>
    </svg>
  );
}

export function NanivioLandingPage({ onSignIn, onGetStarted }: NanivioLandingPageProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <main className="nanivio-art-landing" id="top">
      <header className="nl-header">
        <a className="nl-brand" href="#top" aria-label="Nanivio home" onClick={closeMenu}>
          <NanivioLogo size="sm" compact />
          <span>Nanivio<span className="nl-brand-dot">.</span></span>
        </a>
        <button
          className="nl-menu-toggle"
          type="button"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X /> : <Menu />}
        </button>
        <nav className={menuOpen ? "nl-nav is-open" : "nl-nav"} aria-label="Main navigation">
          <a href="#experience" onClick={closeMenu}>The experience</a>
          <button className="nl-signin" onClick={() => { closeMenu(); onSignIn(); }}>Sign in</button>
          <button className="nl-nav-cta" onClick={() => { closeMenu(); onGetStarted(); }}>
            Enter Nanivio <ArrowUpRight size={15} />
          </button>
        </nav>
      </header>

      <section className="nl-hero" aria-labelledby="nl-hero-title">
        <div className="nl-hero-copy">
          <p className="nl-origin"><span className="nl-origin-mark" aria-hidden="true" />Rooted in Ghana, open to the world</p>
          <h1 id="nl-hero-title">Closer, in every language.</h1>
          <p className="nl-hero-lede">A little more understanding, wherever your people are.</p>
          <div className="nl-hero-actions">
            <button className="nl-button" onClick={onGetStarted}>
              Open Nanivio <ArrowUpRight size={15} />
            </button>
            <a className="nl-scroll-link" href="#experience">
              Discover <ArrowDown size={13} />
            </a>
          </div>
        </div>

        <div className="nl-hero-art" aria-label="Nanivio connected in every direction">
          <div className="nl-device">
            <div className="nl-device-camera" />
            <div className="nl-device-screen">
              <div className="nl-device-brand">
                <NanivioLogo size="sm" compact />
                <span>Nanivio</span>
              </div>
              <div className="nl-art-stage">
                <div className="nl-stage-light" />
                <LuminousNetwork />
                <span className="nl-stage-reflection" />
              </div>
              <div className="nl-device-caption">A world, connected</div>
            </div>
          </div>
          <div className="nl-art-index" aria-hidden="true"><span>01</span><i /> Ghana to everywhere</div>
          <a className="nl-scroll-cue" href="#experience" aria-label="Explore the Nanivio experience">
            <span>Keep exploring</span><ArrowDown size={13} />
          </a>
        </div>
      </section>

      <section className="nl-experience" id="experience" aria-label="The Nanivio experience">
        <div className="nl-experience-heading">
          <span>One conversation, many ways</span>
          <p>Stay close, your way.</p>
        </div>
        <div className="nl-feature-line" aria-label="Nanivio features">
          <span>Messages</span><i /><span>Voice</span><i /><span>Video</span><i /><span>Langpretation</span>
        </div>
        <div className="nl-malvi-note">
          <span className="nl-malvi-mark">M</span>
          <span><strong>Malvi</strong><small>A helping hand inside Nanivio</small></span>
        </div>
      </section>

      <footer className="nl-footer">
        <a className="nl-brand" href="#top" aria-label="Back to top">
          <NanivioLogo size="sm" compact />
          <span>Nanivio<span className="nl-brand-dot">.</span></span>
        </a>
        <span className="nl-footer-note">Rooted in Ghana. Open to the world.</span>
        <button className="nl-footer-signin" onClick={onSignIn}>Sign in <ArrowUpRight size={13} /></button>
      </footer>
    </main>
  );
}

export default NanivioLandingPage;
