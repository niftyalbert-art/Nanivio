import React from 'react';
import { NanivioCelebrationVideoEffect } from './common/NanivioCelebrationVideoEffect';

interface OpeningAnimationProps {
  onComplete: () => void;
}

export const OpeningAnimation: React.FC<OpeningAnimationProps> = ({ onComplete }) => {
  return <NanivioCelebrationVideoEffect mode="intro" onComplete={onComplete} autoCloseDuration={3400} />;
};

