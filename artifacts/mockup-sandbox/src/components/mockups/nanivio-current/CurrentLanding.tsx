import React from 'react';
import './_group.css';
import { NanivioLandingPage } from './LandingPageComponent';

export function CurrentLanding() {
  return (
    <>
      <aside
        aria-label="Design preview, sample content"
        style={{
          position: 'fixed',
          zIndex: 20,
          top: 10,
          right: 10,
          padding: '5px 9px',
          border: '1px solid rgba(226,187,98,.45)',
          background: 'rgba(18,20,23,.88)',
          color: '#d8cb9d',
          font: "9px/1.3 'Space Mono', monospace",
          letterSpacing: '.04em',
        }}
      >
        DESIGN PREVIEW · SAMPLE CONTENT
      </aside>
      <NanivioLandingPage onSignIn={() => {}} onGetStarted={() => {}} />
    </>
  );
}

export default CurrentLanding;
