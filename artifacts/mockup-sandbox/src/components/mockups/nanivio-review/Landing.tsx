import React from 'react';
import './_group.css';
import './NanivioLandingPage.css';
import { NanivioLandingPage } from './LandingPageComponent';

export function Landing() {
  return (
    <>
      <aside
        aria-label="Design preview, sample content"
        style={{
          minHeight: 22,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '3px 8px',
          background: '#121417',
          color: '#b9a975',
          font: "9px/1.3 'Space Mono', monospace",
          letterSpacing: '.04em',
        }}
      >
        DESIGN PREVIEW · SAMPLE LANDING CONTENT
      </aside>
      <NanivioLandingPage onSignIn={() => {}} onGetStarted={() => {}} />
    </>
  );
}

export default Landing;
