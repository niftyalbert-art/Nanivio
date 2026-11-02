import React, { useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Globe2,
  Languages,
  Menu,
  MessageCircle,
  Phone,
  Video,
  X,
} from "lucide-react";
import { NanivioLogo } from "../common/NanivioLogo";
import "./NanivioLandingPage.css";

type NanivioLandingPageProps = {
  onSignIn: () => void;
  onGetStarted: () => void;
};

export function NanivioLandingPage({ onSignIn, onGetStarted }: NanivioLandingPageProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <main className="nanivio-landing" id="top">
      <header className="nl-header">
        <a className="nl-brand" href="#top" aria-label="Nanivio home" onClick={closeMenu}>
          <NanivioLogo size="sm" compact />
          <span>NANIVIO<span className="nl-brand-dot">.</span></span>
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
          <a href="#experience" onClick={closeMenu}>The conversation</a>
          <button className="nl-signin" onClick={() => { closeMenu(); onSignIn(); }}>Sign in</button>
          <button className="nl-nav-cta" onClick={() => { closeMenu(); onGetStarted(); }}>
            Join Nanivio <ArrowUpRight size={15} />
          </button>
        </nav>
      </header>

      <section className="nl-hero" aria-labelledby="nl-hero-title">
        <div className="nl-hero-copy">
          <p className="nl-origin"><span>GH</span> ROOTED IN GHANA · OPEN TO THE WORLD</p>
          <h1 id="nl-hero-title">Closer, in<br /><em>every language.</em></h1>
          <p className="nl-hero-lede">Messages, calls and a little more understanding.</p>
          <div className="nl-hero-actions">
            <button className="nl-button nl-button-cream" onClick={onGetStarted}>
              Come on in <ArrowRight size={16} />
            </button>
            <a className="nl-scroll-link" href="#experience">
              Explore <ArrowDown size={14} />
            </a>
          </div>
        </div>

        <div className="nl-hero-art" aria-label="Illustrative Nanivio conversation preview">
          <div className="nl-art-halo nl-halo-one" />
          <div className="nl-art-halo nl-halo-two" />
          <div className="nl-art-globe"><Globe2 strokeWidth={0.55} /></div>
          <span className="nl-art-pin pin-one" />
          <span className="nl-art-pin pin-two" />
          <div className="nl-preview-card">
            <div className="nl-preview-top">
              <span className="nl-preview-avatar">A</span>
              <span className="nl-preview-person"><strong>Abena</strong><small>Conversation preview</small></span>
              <span className="nl-preview-menu" aria-hidden="true">•••</span>
            </div>
            <div className="nl-preview-date">A MOMENT, SHARED</div>
            <div className="nl-message nl-message-in">The evening here is beautiful.</div>
            <div className="nl-message nl-message-out">Wish I could see it with you.</div>
            <div className="nl-preview-reply">
              <span>Write a message…</span>
              <span className="nl-send-mark"><ArrowUpRight size={15} /></span>
            </div>
            <small className="nl-illustrative">Illustrative preview</small>
          </div>
          <span className="nl-art-caption">MESSAGES · VOICE · VIDEO</span>
          <a className="nl-scroll-cue" href="#experience" aria-label="Explore Nanivio">
            <span>SCROLL TO CONNECT</span><ArrowDown size={14} />
          </a>
        </div>
      </section>

      <section className="nl-experience" id="experience" aria-label="The Nanivio experience">
        <div className="nl-experience-heading">
          <span>ONE CONVERSATION, MANY WAYS.</span>
          <p>Keep your people close.</p>
        </div>
        <div className="nl-feature-line">
          <div><MessageCircle /><span>Messages</span></div>
          <div><Phone /><span>Voice</span></div>
          <div><Video /><span>Video</span></div>
          <div><Languages /><span>Langpretation</span></div>
        </div>
        <div className="nl-malvi-note"><span className="nl-malvi-mark">M</span><span><strong>Malvi</strong><small>A helping hand, inside Nanivio.</small></span><ArrowUpRight size={16} /></div>
      </section>

      <footer className="nl-footer">
        <a className="nl-brand" href="#top" aria-label="Back to top">
          <NanivioLogo size="sm" compact />
          <span>NANIVIO<span className="nl-brand-dot">.</span></span>
        </a>
        <span className="nl-footer-note">Rooted in Ghana. Open to the world.</span>
        <button className="nl-footer-signin" onClick={onSignIn}>Sign in <ArrowUpRight size={13} /></button>
      </footer>
    </main>
  );
}

export default NanivioLandingPage;
