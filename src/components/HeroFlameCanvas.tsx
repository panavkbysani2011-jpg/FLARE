import React, { useEffect, useRef, useState } from 'react';

interface HeroFlameCanvasProps {
  heroContainerRef: React.RefObject<HTMLElement | null>;
}

const IMAGE_CANDIDATES = [
  '/images/hero-flame.png',
  '/images/hero-flame.jpg',
  '/images/hero-flame.webp',
];

const PARTICLE_COUNT = 54; // Strictly within 45–60 subtle microgravity embers

interface EmberParticle {
  homeNx: number;
  homeNy: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseAlpha: number;
  phase: number;
  driftFreqX: number;
  driftFreqY: number;
  driftAmpX: number;
  driftAmpY: number;
  isCoolBlue: boolean;
}

/**
 * Renders the microgravity flame photograph as a crisp, whole, un-sliced image
 * blended into #09090B with gentle CSS ambient breathing, paired with a cursor-shifted
 * subtle glow halo and a transparent HTML5 Canvas rendering 54 smoothly reactive
 * amber and blue microgravity combustion embers/particles.
 */
export const HeroFlameCanvas: React.FC<HeroFlameCanvasProps> = ({
  heroContainerRef,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glowRef = useRef<HTMLDivElement | null>(null);
  const [candidateIdx, setCandidateIdx] = useState(0);
  const [imageHidden, setImageHidden] = useState(false);

  const handleImageError = () => {
    if (candidateIdx + 1 < IMAGE_CANDIDATES.length) {
      setCandidateIdx((prev) => prev + 1);
    } else {
      setImageHidden(true);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let isDisposed = false;
    let rafId = 0;
    let width = 0;
    let height = 0;

    const pointer = {
      targetX: 0,
      targetY: 0,
      smoothX: 0,
      smoothY: 0,
      prevSmoothX: 0,
      prevSmoothY: 0,
      vx: 0,
      vy: 0,
      active: false,
      hoverGain: 0,
    };

    const glowState = {
      offsetX: 0,
      offsetY: 0,
      gain: 0,
    };

    const particles: EmberParticle[] = Array.from(
      { length: PARTICLE_COUNT },
      (_, idx) => {
        // Cluster particles cleanly around the flame zone on the right side
        const seedA = ((idx * 37 + 13) % 100) / 100;
        const seedB = ((idx * 53 + 29) % 100) / 100;
        const seedC = ((idx * 71 + 7) % 100) / 100;
        const angle = seedA * Math.PI * 2;
        const radial = 0.08 + Math.sqrt(seedB) * 0.34;
        const homeNx = Math.min(0.95, Math.max(0.42, 0.70 + Math.cos(angle) * radial * 0.78));
        const homeNy = Math.min(0.84, Math.max(0.16, 0.50 + Math.sin(angle) * radial * 0.85));

        return {
          homeNx,
          homeNy,
          x: homeNx * 1200,
          y: homeNy * 720,
          vx: 0,
          vy: 0,
          radius: 1.2 + seedC * 1.9,
          baseAlpha: 0.32 + seedB * 0.44,
          phase: seedA * Math.PI * 2,
          driftFreqX: 0.24 + seedB * 0.28,
          driftFreqY: 0.20 + seedC * 0.26,
          driftAmpX: 10 + seedC * 18,
          driftAmpY: 8 + seedA * 16,
          // ~35% cool blue leading-edge embers, ~65% warm amber core embers
          isCoolBlue: idx % 3 === 0,
        };
      }
    );

    const handleResize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const prevW = width || rect.width;
      const prevH = height || rect.height;
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (prevW > 0 && prevH > 0) {
        const scaleX = width / prevW;
        const scaleY = height / prevH;
        for (const p of particles) {
          p.x *= scaleX;
          p.y *= scaleY;
        }
      } else {
        for (const p of particles) {
          p.x = p.homeNx * width;
          p.y = p.homeNy * height;
        }
      }
    };

    handleResize();
    for (const p of particles) {
      p.x = p.homeNx * width;
      p.y = p.homeNy * height;
    }
    window.addEventListener('resize', handleResize);

    const host = heroContainerRef.current ?? canvas.parentElement;
    const updatePointer = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      if (!pointer.active) {
        pointer.smoothX = x;
        pointer.smoothY = y;
        pointer.prevSmoothX = x;
        pointer.prevSmoothY = y;
      }
      pointer.targetX = x;
      pointer.targetY = y;
      pointer.active = true;
    };

    const onMouseMove = (e: MouseEvent) => {
      updatePointer(e.clientX, e.clientY);
    };
    const onMouseLeave = () => {
      pointer.active = false;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) {
        updatePointer(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    const onTouchEnd = () => {
      pointer.active = false;
    };

    if (host) {
      host.addEventListener('mousemove', onMouseMove as EventListener);
      host.addEventListener('mouseleave', onMouseLeave as EventListener);
      host.addEventListener('touchmove', onTouchMove as EventListener, {
        passive: true,
      });
      host.addEventListener('touchend', onTouchEnd as EventListener);
    }

    const reducedMotionQuery = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)'
    );
    const startTime = performance.now();

    const renderFrame = (now: number) => {
      if (isDisposed) return;

      if (width > 0 && height > 0) {
        const reducedMotion = Boolean(reducedMotionQuery?.matches);
        const t = reducedMotion ? 0 : (now - startTime) * 0.001;

        ctx.clearRect(0, 0, width, height);

        // Smooth exponential cursor tracking + velocity
        pointer.prevSmoothX = pointer.smoothX;
        pointer.prevSmoothY = pointer.smoothY;
        pointer.smoothX += (pointer.targetX - pointer.smoothX) * 0.14;
        pointer.smoothY += (pointer.targetY - pointer.smoothY) * 0.14;

        const instVx = pointer.smoothX - pointer.prevSmoothX;
        const instVy = pointer.smoothY - pointer.prevSmoothY;
        pointer.vx = pointer.vx * 0.85 + instVx * 0.55;
        pointer.vy = pointer.vy * 0.85 + instVy * 0.55;

        const targetGain = pointer.active && !reducedMotion ? 1 : 0;
        pointer.hoverGain += (targetGain - pointer.hoverGain) * 0.07;

        // Smooth spring easing for subtle flame radial glow toward pointer
        const flameAnchorX = width * (width >= 768 ? 0.70 : 0.62);
        const flameAnchorY = height * 0.50;
        const desiredGlowX =
          pointer.active && !reducedMotion
            ? Math.max(-52, Math.min(52, (pointer.smoothX - flameAnchorX) * 0.22))
            : 0;
        const desiredGlowY =
          pointer.active && !reducedMotion
            ? Math.max(-38, Math.min(38, (pointer.smoothY - flameAnchorY) * 0.22))
            : 0;

        glowState.offsetX += (desiredGlowX - glowState.offsetX) * 0.06;
        glowState.offsetY += (desiredGlowY - glowState.offsetY) * 0.06;
        glowState.gain += (targetGain - glowState.gain) * 0.06;

        if (glowRef.current) {
          glowRef.current.style.transform = `translate3d(${glowState.offsetX.toFixed(1)}px, ${glowState.offsetY.toFixed(1)}px, 0) scale(${(1 + glowState.gain * 0.04).toFixed(3)})`;
          glowRef.current.style.opacity = (0.58 + glowState.gain * 0.24).toFixed(3);
        }

        const interactRadius = 185;
        const interactRadiusSq = interactRadius * interactRadius;

        for (const p of particles) {
          const orbitX = reducedMotion
            ? 0
            : Math.sin(t * p.driftFreqX + p.phase) * p.driftAmpX;
          const orbitY = reducedMotion
            ? 0
            : Math.cos(t * p.driftFreqY + p.phase * 1.3) * p.driftAmpY;

          const targetX = p.homeNx * width + orbitX;
          const targetY = p.homeNy * height + orbitY;

          // Gentle spring return toward ambient flame orbit
          p.vx += (targetX - p.x) * 0.022;
          p.vy += (targetY - p.y) * 0.022;

          // Smooth cursor repulsion + fluid microgravity swirl
          if (!reducedMotion && pointer.hoverGain > 0.01) {
            const dx = p.x - pointer.smoothX;
            const dy = p.y - pointer.smoothY;
            const distSq = dx * dx + dy * dy;

            if (distSq < interactRadiusSq && distSq > 1) {
              const dist = Math.sqrt(distSq);
              const strength = Math.pow(1 - dist / interactRadius, 2) * pointer.hoverGain;

              // Calm radial repulsion away from pointer
              p.vx += (dx / dist) * strength * 1.45;
              p.vy += (dy / dist) * strength * 1.45;

              // Subtle laminar swirl around cursor + wake follow
              p.vx += (-dy / dist) * strength * 0.92 + pointer.vx * strength * 0.18;
              p.vy += (dx / dist) * strength * 0.92 + pointer.vy * strength * 0.18;
            }
          }

          p.vx *= 0.89;
          p.vy *= 0.89;
          p.x += p.vx;
          p.y += p.vy;

          const shimmer = reducedMotion
            ? 1
            : 0.78 + 0.22 * Math.sin(t * 1.35 + p.phase);
          const alpha = Math.min(0.9, p.baseAlpha * shimmer);

          const glowRadius = p.radius * 4.6;
          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowRadius);

          if (p.isCoolBlue) {
            grad.addColorStop(0, `rgba(125, 211, 252, ${alpha.toFixed(3)})`);
            grad.addColorStop(0.4, `rgba(56, 189, 248, ${(alpha * 0.45).toFixed(3)})`);
            grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
          } else {
            grad.addColorStop(0, `rgba(253, 224, 71, ${alpha.toFixed(3)})`);
            grad.addColorStop(0.38, `rgba(245, 158, 11, ${(alpha * 0.48).toFixed(3)})`);
            grad.addColorStop(1, 'rgba(245, 158, 11, 0)');
          }

          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, glowRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);

    return () => {
      isDisposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      if (host) {
        host.removeEventListener('mousemove', onMouseMove as EventListener);
        host.removeEventListener('mouseleave', onMouseLeave as EventListener);
        host.removeEventListener('touchmove', onTouchMove as EventListener);
        host.removeEventListener('touchend', onTouchEnd as EventListener);
      }
    };
  }, [heroContainerRef]);

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden select-none"
      aria-hidden="true"
    >
      {/* Subtle cursor-shifted warm amber & cool blue radial glow halo behind flame */}
      <div className="absolute inset-y-0 right-0 w-full md:w-[70%] pointer-events-none hero-flame-halo">
        <div
          ref={glowRef}
          className="w-full h-full pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 60% 50%, rgba(245,158,11,0.18) 0%, rgba(56,189,248,0.10) 34%, rgba(9,9,11,0) 68%)',
          }}
        />
      </div>

      {/* Crisp, whole, un-sliced high-res microgravity flame photo with smooth breathing */}
      {!imageHidden && (
        <div className="absolute inset-y-0 right-0 w-full md:w-[68%] lg:w-[64%] flex items-center justify-center md:justify-end">
          <div
            className="relative w-full h-full flex items-center justify-center hero-flame-ambient"
            style={{
              WebkitMaskImage:
                'radial-gradient(ellipse 76% 74% at 58% 50%, #000000 50%, rgba(0,0,0,0.72) 74%, transparent 97%)',
              maskImage:
                'radial-gradient(ellipse 76% 74% at 58% 50%, #000000 50%, rgba(0,0,0,0.72) 74%, transparent 97%)',
            }}
          >
            <img
              src={IMAGE_CANDIDATES[candidateIdx]}
              alt=""
              draggable={false}
              onError={handleImageError}
              className="w-full h-full max-h-[88vh] object-contain object-center md:object-right mix-blend-lighten select-none"
            />
          </div>
        </div>
      )}

      {/* Transparent HTML5 Canvas overlay rendering 54 soft amber & blue microgravity embers */}
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 w-full h-full"
      />
    </div>
  );
};
