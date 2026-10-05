import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { cinematicAudio } from '../../utils/cinematicAudio';

interface NanivioCelebrationVideoEffectProps {
  mode?: 'signup' | 'signin' | 'intro';
  userProfile?: {
    nvId?: string;
    displayName?: string;
    role?: string;
    preferredLanguage?: string;
    email?: string;
    country?: string;
  } | null;
  onComplete: () => void;
  autoCloseDuration?: number; // In milliseconds (e.g. 3300)
}

// Helper for rounded rectangle with full browser compatibility
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, width, height, radius);
    return;
  }
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
}

export const NanivioCelebrationVideoEffect: React.FC<NanivioCelebrationVideoEffectProps> = ({
  onComplete,
  autoCloseDuration = 3300,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isExiting, setIsExiting] = useState(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    // Play cinematic reveal sound effect
    cinematicAudio.playLogoReveal();

    const exitTimer = setTimeout(() => {
      setIsExiting(true);
    }, autoCloseDuration - 400);

    const completeTimer = setTimeout(() => {
      if (onCompleteRef.current) {
        onCompleteRef.current();
      }
    }, autoCloseDuration);

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(completeTimer);
    };
  }, [autoCloseDuration]);

  const handleSkip = () => {
    setIsExiting(true);
    setTimeout(() => {
      if (onCompleteRef.current) {
        onCompleteRef.current();
      }
    }, 200);
  };

  // -------------------------------------------------------------
  // CANVAS 3D PARTICLES, DOTTED GLOBE, VORTEX & FLARE ENGINE
  // Directly reproducing the Nanivio 3D video sequence
  // -------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Dotted Globe Point Cloud
    interface GlobePoint {
      lat: number;
      lon: number;
      size: number;
      alpha: number;
    }
    const globePoints: GlobePoint[] = [];
    const numPoints = 280;
    for (let i = 0; i < numPoints; i++) {
      const lat = Math.acos(2 * Math.random() - 1) - Math.PI / 2;
      const lon = 2 * Math.PI * Math.random();
      globePoints.push({
        lat,
        lon,
        size: Math.random() * 1.5 + 0.8,
        alpha: Math.random() * 0.6 + 0.4,
      });
    }

    // Swirling Stardust Particle System
    interface VortexParticle {
      angle: number;
      radius: number;
      speed: number;
      radialSpeed: number;
      size: number;
      color: string;
      alpha: number;
      z: number;
    }
    const vortexParticles: VortexParticle[] = [];
    const vortexColors = ['#00f2fe', '#38bdf8', '#818cf8', '#c084fc', '#d946ef', '#ec4899', '#ffffff'];

    for (let i = 0; i < 140; i++) {
      vortexParticles.push({
        angle: Math.random() * Math.PI * 2,
        radius: Math.random() * 140 + 70,
        speed: (Math.random() * 0.05 + 0.03) * (Math.random() > 0.3 ? 1 : -1),
        radialSpeed: (Math.random() - 0.5) * 0.4,
        size: Math.random() * 2.4 + 0.8,
        color: vortexColors[Math.floor(Math.random() * vortexColors.length)],
        alpha: Math.random() * 0.8 + 0.2,
        z: Math.random() * 40 - 20,
      });
    }

    // Spark Burst Particles for Apex Flare
    interface BurstSpark {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      color: string;
      alpha: number;
      decay: number;
    }
    const burstSparks: BurstSpark[] = [];

    const startTime = performance.now();

    const render = (now: number) => {
      const elapsed = (now - startTime) / 1000;
      const cx = width / 2;
      const cy = height * 0.42; // Center matching the 3D 'N' position
      const globeRadius = Math.min(width, height) * 0.28;

      // 1. Deep Space Cosmic Background
      const bgGrad = ctx.createRadialGradient(cx, cy, 30, cx, cy, Math.max(width, height) * 0.8);
      bgGrad.addColorStop(0, '#0a1329');
      bgGrad.addColorStop(0.4, '#040916');
      bgGrad.addColorStop(1, '#010308');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. Neon Atmosphere Glow Behind Globe
      const glowGrad = ctx.createRadialGradient(cx, cy, globeRadius * 0.4, cx, cy, globeRadius * 1.5);
      glowGrad.addColorStop(0, 'rgba(0, 242, 254, 0.18)');
      glowGrad.addColorStop(0.5, 'rgba(192, 132, 252, 0.12)');
      glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, 0, width, height);

      // 3. Glowing Neon Orbital Rings
      const ringTilt = 0.35;
      const ringRadius = globeRadius * 1.18;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, ringTilt);

      // Outer Cyan-to-Purple Neon Ring
      const ringGrad = ctx.createLinearGradient(-ringRadius, 0, ringRadius, 0);
      ringGrad.addColorStop(0, 'rgba(0, 242, 254, 0.85)');
      ringGrad.addColorStop(0.5, 'rgba(129, 140, 248, 0.4)');
      ringGrad.addColorStop(1, 'rgba(217, 70, 239, 0.85)');

      ctx.beginPath();
      ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
      ctx.strokeStyle = ringGrad;
      ctx.lineWidth = 3.5;
      ctx.shadowColor = '#00f2fe';
      ctx.shadowBlur = 18;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();

      // 4. Rotating Dotted 3D Globe
      const globeRot = elapsed * 0.45;
      globePoints.forEach((pt) => {
        const currentLon = pt.lon + globeRot;
        const x3d = globeRadius * Math.cos(pt.lat) * Math.sin(currentLon);
        const y3d = globeRadius * Math.sin(pt.lat);
        const z3d = globeRadius * Math.cos(pt.lat) * Math.cos(currentLon);

        // Only draw points on the visible hemisphere
        if (z3d > -globeRadius * 0.1) {
          const depthScale = (z3d + globeRadius) / (2 * globeRadius);
          const px = cx + x3d;
          const py = cy + y3d;
          const pointAlpha = pt.alpha * (0.3 + depthScale * 0.7);

          ctx.fillStyle = depthScale > 0.6 ? '#38bdf8' : '#818cf8';
          ctx.globalAlpha = pointAlpha * 0.7;
          ctx.beginPath();
          ctx.arc(px, py, pt.size * (0.8 + depthScale * 0.6), 0, Math.PI * 2);
          ctx.fill();
        }
      });
      ctx.globalAlpha = 1;

      // 5. Swirling Stardust Particle Vortex Ring (0.3s -> 3.2s)
      const vortexIntensity = Math.min(1, elapsed * 1.5);
      vortexParticles.forEach((p) => {
        p.angle += p.speed * (1 + (elapsed > 0.8 && elapsed < 1.8 ? 1.4 : 0));
        p.radius += p.radialSpeed;
        if (p.radius < 65) p.radius = 160;
        if (p.radius > 165) p.radius = 70;

        const px = cx + Math.cos(p.angle) * p.radius;
        const py = cy + Math.sin(p.angle) * (p.radius * 0.42) + Math.sin(elapsed * 4 + p.angle) * 8;

        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha * vortexIntensity;
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fill();

        // Particle trail
        const trailX = cx + Math.cos(p.angle - p.speed * 2) * p.radius;
        const trailY = cy + Math.sin(p.angle - p.speed * 2) * (p.radius * 0.42);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * 0.7;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(trailX, trailY);
        ctx.stroke();
      });
      ctx.globalAlpha = 1;

      // 6. Floating Translucent Glass Smartphone Devices (Emerging at 1.0s)
      if (elapsed > 0.9) {
        const phoneProgress = Math.min(1, (elapsed - 0.9) * 1.8);
        const pAlpha = phoneProgress * 0.85;

        // Top-right floating phone
        ctx.save();
        ctx.translate(cx + 140 * phoneProgress, cy - 90 * phoneProgress);
        ctx.rotate(-0.16);
        ctx.globalAlpha = pAlpha;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        drawRoundedRect(ctx, -42, -72, 84, 144, 16);
        ctx.fill();
        ctx.stroke();

        // Phone screen gradient reflection
        const screenGrad1 = ctx.createLinearGradient(-38, -68, 38, 68);
        screenGrad1.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
        screenGrad1.addColorStop(0.4, 'rgba(0, 242, 254, 0.1)');
        screenGrad1.addColorStop(1, 'rgba(217, 70, 239, 0.08)');
        ctx.fillStyle = screenGrad1;
        ctx.beginPath();
        drawRoundedRect(ctx, -38, -68, 76, 136, 12);
        ctx.fill();

        // Phone Camera pill
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.beginPath();
        drawRoundedRect(ctx, -12, -64, 24, 6, 3);
        ctx.fill();
        ctx.restore();

        // Top-left floating phone
        ctx.save();
        ctx.translate(cx - 150 * phoneProgress, cy - 60 * phoneProgress);
        ctx.rotate(0.2);
        ctx.globalAlpha = pAlpha * 0.8;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
        ctx.strokeStyle = 'rgba(192, 132, 252, 0.4)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        drawRoundedRect(ctx, -38, -65, 76, 130, 14);
        ctx.fill();
        ctx.stroke();

        const screenGrad2 = ctx.createLinearGradient(-34, -60, 34, 60);
        screenGrad2.addColorStop(0, 'rgba(255, 255, 255, 0.14)');
        screenGrad2.addColorStop(0.5, 'rgba(192, 132, 252, 0.08)');
        screenGrad2.addColorStop(1, 'rgba(0, 242, 254, 0.06)');
        ctx.fillStyle = screenGrad2;
        ctx.beginPath();
        drawRoundedRect(ctx, -34, -61, 68, 122, 10);
        ctx.fill();
        ctx.restore();
      }

      // 7. Anamorphic Lens Flare Burst (At 1.3s - 2.2s)
      if (elapsed > 1.2 && elapsed < 2.3) {
        const flareAge = (elapsed - 1.2) / 1.0;
        const flareAlpha = Math.sin(flareAge * Math.PI) * 0.85;

        // Horizontal wide lens streak
        const flareGrad = ctx.createLinearGradient(cx - width * 0.45, cy, cx + width * 0.45, cy);
        flareGrad.addColorStop(0, 'rgba(0, 242, 254, 0)');
        flareGrad.addColorStop(0.3, 'rgba(0, 242, 254, 0.6)');
        flareGrad.addColorStop(0.5, `rgba(255, 255, 255, ${flareAlpha})`);
        flareGrad.addColorStop(0.7, 'rgba(217, 70, 239, 0.6)');
        flareGrad.addColorStop(1, 'rgba(217, 70, 239, 0)');
        ctx.fillStyle = flareGrad;
        ctx.fillRect(0, cy - 3, width, 6);

        // Central radiant flare ring
        const centerBurst = ctx.createRadialGradient(cx, cy, 5, cx, cy, 120);
        centerBurst.addColorStop(0, `rgba(255, 255, 255, ${flareAlpha * 0.9})`);
        centerBurst.addColorStop(0.3, `rgba(0, 242, 254, ${flareAlpha * 0.5})`);
        centerBurst.addColorStop(0.7, `rgba(217, 70, 239, ${flareAlpha * 0.3})`);
        centerBurst.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = centerBurst;
        ctx.beginPath();
        ctx.arc(cx, cy, 120, 0, Math.PI * 2);
        ctx.fill();

        // Spawn burst sparks once during peak
        if (burstSparks.length < 40 && elapsed > 1.35 && elapsed < 1.6) {
          for (let s = 0; s < 5; s++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 4 + 2;
            burstSparks.push({
              x: cx,
              y: cy,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              size: Math.random() * 2.5 + 1,
              color: vortexColors[Math.floor(Math.random() * vortexColors.length)],
              alpha: 1,
              decay: Math.random() * 0.03 + 0.02,
            });
          }
        }
      }

      // Render Burst Sparks
      for (let s = burstSparks.length - 1; s >= 0; s--) {
        const spark = burstSparks[s];
        spark.x += spark.vx;
        spark.y += spark.vy;
        spark.alpha -= spark.decay;
        if (spark.alpha <= 0) {
          burstSparks.splice(s, 1);
          continue;
        }
        ctx.fillStyle = spark.color;
        ctx.globalAlpha = spark.alpha;
        ctx.beginPath();
        ctx.arc(spark.x, spark.y, spark.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div
      onClick={handleSkip}
      className={`fixed inset-0 z-[100] bg-[#010308] text-white flex flex-col items-center justify-center overflow-hidden font-sans select-none cursor-pointer transition-opacity duration-300 ${
        isExiting ? 'opacity-0 scale-105' : 'opacity-100 scale-100'
      }`}
    >
      {/* Background 3D Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

      {/* ------------------------------------------------------------- */}
      {/* CENTER STAGE: 3D EMBLEM 'N' & REFINED BRANDING */}
      {/* ------------------------------------------------------------- */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center max-w-xl mx-auto px-4 -mt-6 sm:-mt-10 pointer-events-none">
        {/* 3D Glossy Beveled 'N' Emblem */}
        <motion.div
          initial={{ scale: 0.35, opacity: 0, rotateY: -70 }}
          animate={{ scale: 1, opacity: 1, rotateY: 0 }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-36 h-36 sm:w-48 sm:h-48 flex items-center justify-center mb-6"
        >
          {/* Radial Multi-Color Neon Aura Glow */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-cyan-500/50 via-purple-500/50 to-pink-500/40 filter blur-3xl animate-pulse" />

          {/* SVG 3D Glossy Beveled 'N' */}
          <svg
            className="w-full h-full filter drop-shadow-[0_0_40px_rgba(0,242,254,0.65)]"
            viewBox="0 0 200 200"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              {/* Left Pillar Cyan/Blue Iridescent Gradient */}
              <linearGradient id="leftPillarGrad" x1="30" y1="20" x2="80" y2="180" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="50%" stopColor="#00f2fe" />
                <stop offset="100%" stopColor="#0284c7" />
              </linearGradient>

              {/* Diagonal Connecting Bridge Gradient */}
              <linearGradient id="diagonalBridgeGrad" x1="40" y1="30" x2="160" y2="170" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#00f2fe" />
                <stop offset="45%" stopColor="#6366f1" />
                <stop offset="80%" stopColor="#a855f7" />
                <stop offset="100%" stopColor="#d946ef" />
              </linearGradient>

              {/* Right Pillar Violet/Magenta Gradient */}
              <linearGradient id="rightPillarGrad" x1="130" y1="20" x2="170" y2="180" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#a855f7" />
                <stop offset="60%" stopColor="#c084fc" />
                <stop offset="100%" stopColor="#ec4899" />
              </linearGradient>

              {/* Specular White Gloss Glint */}
              <linearGradient id="glossHighlight" x1="40" y1="20" x2="40" y2="160" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.75" />
                <stop offset="35%" stopColor="#ffffff" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Left Vertical Pillar */}
            <path
              d="M 52 38 C 43 38 36 45 36 54 L 36 146 C 36 155 43 162 52 162 C 61 162 68 155 68 146 L 68 54 C 68 45 61 38 52 38 Z"
              fill="url(#leftPillarGrad)"
            />

            {/* Diagonal Beveled Crossbar */}
            <path
              d="M 52 38 C 61 38 68 45 68 54 L 132 146 C 136 152 144 156 152 152 C 158 148 160 140 156 134 L 92 42 C 88 36 80 32 72 36 Z"
              fill="url(#diagonalBridgeGrad)"
            />

            {/* Right Vertical Pillar */}
            <path
              d="M 148 38 C 139 38 132 45 132 54 L 132 146 C 132 155 139 162 148 162 C 157 162 164 155 164 146 L 164 54 C 164 45 157 38 148 38 Z"
              fill="url(#rightPillarGrad)"
            />

            {/* Glossy Curved Highlight Overlay */}
            <path
              d="M 40 46 C 40 42 44 39 49 39 C 53 39 56 42 56 46 L 56 110 C 51 114 45 114 40 110 Z"
              fill="url(#glossHighlight)"
            />
          </svg>
        </motion.div>

        {/* Brand Name Typography: NANIVIO (with Rainbow Gradient 'O') */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.7 }}
          className="space-y-2"
        >
          <div className="flex items-center justify-center tracking-[0.35em] text-3xl sm:text-4xl md:text-5xl font-black text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.45)]">
            <span>NANIVI</span>
            <span className="inline-block relative ml-0.5">
              <span className="text-transparent bg-clip-text bg-gradient-to-tr from-cyan-400 via-purple-400 to-pink-500">
                O
              </span>
            </span>
          </div>

          <p className="text-[11px] sm:text-xs md:text-sm font-bold tracking-[0.32em] text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-300 to-purple-400">
            CONNECT. UNDERSTAND. TRANSACT.
          </p>
        </motion.div>
      </div>

      {/* Subtle Bottom Skip Hint */}
      <div className="absolute bottom-6 inset-x-0 flex justify-center pointer-events-none opacity-60 hover:opacity-100 transition-opacity">
        <span className="text-[10px] font-mono tracking-widest text-slate-400 uppercase">
          Tap anywhere to continue
        </span>
      </div>
    </div>
  );
};
