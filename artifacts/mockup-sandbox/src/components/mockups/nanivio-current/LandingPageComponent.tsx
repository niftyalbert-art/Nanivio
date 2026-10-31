import React, { useState } from "react";
import {
  ArrowDown, ArrowRight, ArrowUpRight, AudioLines, ChevronDown,
  Globe2, Languages, Menu, MessageCircle, Phone, Sparkles,
  Video, X,
} from "lucide-react";
import { NanivioLogo } from "./common/NanivioLogo";

type NanivioLandingPageProps = { onSignIn: () => void; onGetStarted: () => void };

const features = [
  { number: "01", icon: MessageCircle, title: "A message, in your own words.", text: "Keep the conversation moving with messages that feel natural, familiar and close—wherever life has taken you." },
  { number: "02", icon: Phone, title: "Hear the voice behind the words.", text: "Make room for the warmth, rhythm and small moments that only a call can carry." },
  { number: "03", icon: Languages, title: "Meet in the meaning.", text: "Langpretation helps people communicate across languages, so a different first language needn’t mean distance." },
  { number: "04", icon: Sparkles, title: "A little help, right when you need it.", text: "Malvi is your personal assistant on Nanivio—ready to help you find your way through the app and everyday conversations." },
];

const faqs = [
  { q: "What is Nanivio?", a: "Nanivio brings messaging, voice and video calls, Langpretation and the personal assistant Malvi together in one place—built for people whose lives cross borders." },
  { q: "What is Langpretation?", a: "Langpretation is Nanivio’s approach to helping people communicate across languages. It is designed to bring understanding into the conversation, not take people out of it." },
  { q: "Who is Malvi?", a: "Malvi is Nanivio’s personal assistant. You can turn to Malvi for help finding your way around Nanivio and support with your conversations." },
  { q: "Is Nanivio only for people in Ghana?", a: "No. Nanivio is for people everywhere. Its roots and spirit are connected to Ghana and Africa, while its purpose is to bring people together across the world." },
];

export function NanivioLandingPage({ onSignIn, onGetStarted }: NanivioLandingPageProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const closeMenu = () => setMenuOpen(false);

  return (
    <main className="nanivio-landing">
      <header className="nl-header">
        <a className="nl-brand" href="#top" aria-label="Nanivio home" onClick={closeMenu}>
          <NanivioLogo size="sm" compact />
          <span>NANIVIO<span className="nl-brand-dot">.</span></span>
        </a>
        <button className="nl-menu-toggle" type="button" aria-expanded={menuOpen} aria-label={menuOpen ? "Close navigation" : "Open navigation"} onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X /> : <Menu />}
        </button>
        <nav className={menuOpen ? "nl-nav is-open" : "nl-nav"} aria-label="Main navigation">
          <a href="#experience" onClick={closeMenu}>The experience</a>
          <a href="#langpretation" onClick={closeMenu}>Langpretation</a>
          <a href="#malvi" onClick={closeMenu}>Meet Malvi</a>
          <a href="#about" onClick={closeMenu}>Our story</a>
          <button className="nl-signin" onClick={() => { closeMenu(); onSignIn(); }}>Sign in</button>
          <button className="nl-nav-cta" onClick={() => { closeMenu(); onGetStarted(); }}>Join Nanivio <ArrowUpRight size={15} /></button>
        </nav>
      </header>

      <section className="nl-hero" id="top">
        <div className="nl-hero-grid" aria-hidden="true" />
        <div className="nl-hero-copy">
          <p className="nl-kicker"><span className="nl-kicker-line" /> FROM GHANA, FOR EVERYWHERE</p>
          <h1>Your world.<br />One conversation<br /><em>away.</em></h1>
          <p className="nl-hero-lede">The people who matter don’t always speak the same language. Nanivio brings your conversations closer—across borders, across languages, across the miles.</p>
          <div className="nl-hero-actions">
            <button className="nl-button nl-button-gold" onClick={onGetStarted}>Come on in <ArrowRight size={17} /></button>
            <a className="nl-text-link" href="#experience">Discover Nanivio <ArrowDown size={15} /></a>
          </div>
          <div className="nl-origin-note"><span className="nl-origin-mark">GH</span><span>Rooted in Ghana.<br /><strong>Made for the world.</strong></span></div>
        </div>
        <div className="nl-hero-art" aria-label="Illustrative Nanivio conversation preview">
          <div className="nl-art-orbit nl-orbit-one" /><div className="nl-art-orbit nl-orbit-two" />
          <div className="nl-art-globe"><span className="nl-globe-lat nl-lat-one" /><span className="nl-globe-lat nl-lat-two" /><span className="nl-globe-long" /><Globe2 strokeWidth={0.65} /></div>
          <span className="nl-art-point point-a" /><span className="nl-art-point point-b" /><span className="nl-art-point point-c" />
          <div className="nl-preview-card">
            <div className="nl-preview-top"><span className="nl-preview-avatar">A</span><span><strong>Abena</strong><small>Conversation preview</small></span><span className="nl-preview-menu">•••</span></div>
            <div className="nl-preview-date">A MOMENT, SHARED</div>
            <div className="nl-message nl-message-in">The evening here is beautiful.</div>
            <div className="nl-message nl-message-out">Wish I could see it with you.</div>
            <div className="nl-preview-reply"><span>Write a message…</span><span className="nl-send-mark"><ArrowUpRight size={15} /></span></div>
            <small className="nl-illustrative">Illustrative preview</small>
          </div>
          <div className="nl-orbit-caption"><span className="nl-caption-dot" /> ONE WORLD, MANY WAYS TO SAY “I’M HERE”</div>
          <span className="nl-coordinate">05°36′N 00°11′W &nbsp; / &nbsp; EVERYWHERE</span>
        </div>
        <a className="nl-scroll-cue" href="#experience"><span>SCROLL TO CONNECT</span><ArrowDown size={14} /></a>
      </section>

      <section className="nl-intro-band" id="about">
        <span className="nl-section-no">A NOTE ON BELONGING / 01</span>
        <p>Some things travel farther than we do.<br /><em>A voice. A laugh. A “how are you?”</em></p>
        <span className="nl-band-aside">Nanivio is a place for all of it.</span>
      </section>

      <section className="nl-experience nl-section-wrap" id="experience">
        <div className="nl-section-head">
          <div><p className="nl-kicker"><span className="nl-kicker-line" /> THE NANIVIO EXPERIENCE</p><h2>Closer, in every<br /><em>way that matters.</em></h2></div>
          <p className="nl-section-summary">Not another thing to keep up with. A more human way to keep in touch—with the people, places and languages that make your world yours.</p>
        </div>
        <div className="nl-feature-list">
          {features.map(({ number, icon: Icon, title, text }) => <article className="nl-feature-row" key={number}>
            <span className="nl-feature-number">{number}</span><span className="nl-feature-icon"><Icon size={21} strokeWidth={1.55} /></span>
            <div className="nl-feature-copy"><h3>{title}</h3><p>{text}</p></div><ArrowUpRight className="nl-feature-arrow" size={19} />
          </article>)}
        </div>
      </section>

      <section className="nl-lang-section" id="langpretation">
        <div className="nl-lang-art" aria-hidden="true">
          <span className="nl-lang-ring ring-outer" /><span className="nl-lang-ring ring-mid" /><span className="nl-lang-ring ring-inner" />
          <div className="nl-lang-center"><AudioLines size={38} strokeWidth={1.1} /><span>MEANING<br />IN MOTION</span></div>
          <span className="nl-lang-word word-one">Medaase</span><span className="nl-lang-word word-two">Thank you</span><span className="nl-lang-word word-three">Merci</span>
          <span className="nl-lang-art-note">A SHARED MOMENT<br />NEEDS NO PERFECT SCRIPT</span>
        </div>
        <div className="nl-lang-copy">
          <p className="nl-kicker"><span className="nl-kicker-line" /> LANGUAGE, WITH MORE HEART</p>
          <h2>Different words.<br /><em>Same feeling.</em></h2>
          <p>Language should open doors, not quietly close them. Langpretation is Nanivio’s way of helping people meet in the meaning—so the conversation stays about the people in it.</p>
          <a className="nl-underlined-link" href="#experience">Explore the experience <ArrowRight size={16} /></a>
          <span className="nl-ghanian-note">Medaase — thank you, in Twi.<br /><small>One small word. A whole lot of warmth.</small></span>
        </div>
      </section>

      <section className="nl-malvi-section" id="malvi">
        <div className="nl-malvi-copy">
          <p className="nl-kicker"><span className="nl-kicker-line" /> A FRIENDLY FACE IN YOUR CORNER</p>
          <h2>Meet Malvi.<br /><em>Your Nanivio sidekick.</em></h2>
          <p>Every good conversation has someone who helps things along. Malvi is your personal assistant on Nanivio—here to help you find your way around and make more of the moments you share.</p>
          <button className="nl-button nl-button-outline" onClick={onGetStarted}>Get to know Nanivio <ArrowRight size={16} /></button>
        </div>
        <div className="nl-malvi-visual">
          <div className="nl-malvi-frame"><div className="nl-malvi-topline"><span>YOUR PERSONAL ASSISTANT</span><span>NV / M-01</span></div>
            <img src="/__mockup/images/malvi_avatar_v2.jpg" alt="Malvi, Nanivio's personal assistant" />
            <div className="nl-malvi-caption"><span><strong>Malvi</strong><small>Here to help you feel at home.</small></span><span className="nl-malvi-spark"><Sparkles size={18} /></span></div>
          </div>
          <span className="nl-malvi-side-note">A LITTLE HELP.<br />A LOT MORE HUMAN.</span>
        </div>
      </section>

      <section className="nl-calls-section">
        <div className="nl-call-heading"><p className="nl-kicker"><span className="nl-kicker-line" /> THE DISTANCE, LESS DISTANT</p><h2>Say it. Hear it.<br /><em>See you there.</em></h2></div>
        <div className="nl-call-story">
          <div className="nl-call-art"><div className="nl-call-disc"><span className="nl-call-wave wave-a" /><span className="nl-call-wave wave-b" /><span className="nl-call-wave wave-c" /><div className="nl-call-person"><Video size={25} strokeWidth={1.3} /></div></div><span className="nl-call-art-label">VOICE & VIDEO / TOGETHER, FROM ANYWHERE</span></div>
          <div className="nl-call-copy"><p>Some news is better heard. Some days are better seen. And some silences are only comfortable with your people.</p><p>Nanivio makes space for voice and video calls—so connection can sound like itself, and feel a little more like home.</p><a href="#faq" className="nl-underlined-link">A few things you may wonder <ArrowRight size={16} /></a></div>
        </div>
      </section>

      <section className="nl-quote-section">
        <span className="nl-quote-mark">“</span><p>A world apart<br />can still feel<br /><em>close at heart.</em></p>
        <span className="nl-quote-rule" /><span className="nl-quote-caption">BUILT FOR THE CONVERSATIONS THAT BRING US HOME.</span>
      </section>

      <section className="nl-faq-section nl-section-wrap" id="faq">
        <div className="nl-faq-heading"><p className="nl-kicker"><span className="nl-kicker-line" /> GOOD TO KNOW</p><h2>A few things<br /><em>you may wonder.</em></h2><p>Still curious? We’re glad you’re here.</p></div>
        <div className="nl-faq-list">{faqs.map((faq, i) => <article className={`nl-faq-item ${openFaq === i ? "is-open" : ""}`} key={faq.q}>
          <h3><button aria-expanded={openFaq === i} onClick={() => setOpenFaq(openFaq === i ? null : i)}>{faq.q}<ChevronDown size={18} /></button></h3>
          {openFaq === i && <p>{faq.a}</p>}
        </article>)}</div>
      </section>

      <section className="nl-final-cta">
        <span className="nl-final-index">YOUR WORLD IS WAITING / 01</span>
        <p className="nl-kicker"><span className="nl-kicker-line" /> THE FIRST HELLO IS YOURS</p>
        <h2>Bring your world<br /><em>a little closer.</em></h2>
        <button className="nl-button nl-button-gold" onClick={onGetStarted}>Start a conversation <ArrowRight size={17} /></button>
        <span className="nl-final-flourish" aria-hidden="true"><Globe2 /></span>
      </section>

      <footer className="nl-footer">
        <a className="nl-brand" href="#top" aria-label="Back to top"><NanivioLogo size="sm" compact /><span>NANIVIO<span className="nl-brand-dot">.</span></span></a>
        <span className="nl-footer-note">Rooted in Ghana. Open to the world.</span>
        <div className="nl-footer-links"><a href="#experience">Experience</a><a href="#about">Our story</a><a href="#faq">FAQ</a><button onClick={onSignIn}>Sign in <ArrowUpRight size={13} /></button></div>
        <span className="nl-copyright">© {new Date().getFullYear()} NANIVIO</span>
      </footer>
    </main>
  );
}

export default NanivioLandingPage;
