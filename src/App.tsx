import { useEffect, useRef, useState } from 'react';
import './app.js';

export default function App() {
  const [splashVisible, setSplashVisible] = useState(true);
  const [activeChips, setActiveChips] = useState<number[]>([]);
  const [typedQuote, setTypedQuote] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // Inject base containers dynamically if missing
    const requiredContainers = [
      { id: 'sheet-backdrop', className: 'backdrop' },
      { id: 'sheet', className: 'bottom-sheet' },
      { id: 'sel-toolbar', className: 'sel-toolbar' },
      { id: 'toast-container', className: 'toast-container' }
    ];

    requiredContainers.forEach(({ id, className }) => {
      if (!document.getElementById(id)) {
        const el = document.createElement('div');
        el.id = id;
        el.className = className;
        document.body.appendChild(el);
      }
    });

    // -------------------------------------------------------------
    // INTERACTIVE PARTICLE CONSTELLATION CANVAS
    // -------------------------------------------------------------
    const canvas = canvasRef.current;
    let animId: number;
    let ripples: { x: number; y: number; r: number; alpha: number }[] = [];

    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const width = (canvas.width = window.innerWidth);
        const height = (canvas.height = window.innerHeight);

        const numParticles = 35;
        const particles = Array.from({ length: numParticles }, () => ({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.7,
          vy: (Math.random() - 0.5) * 0.7,
          radius: Math.random() * 2.2 + 1,
        }));

        const handleCanvasClick = (e: MouseEvent | TouchEvent) => {
          const rect = canvas.getBoundingClientRect();
          const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
          const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
          ripples.push({
            x: clientX - rect.left,
            y: clientY - rect.top,
            r: 2,
            alpha: 0.8,
          });
        };

        window.addEventListener('pointerdown', handleCanvasClick);

        const render = () => {
          ctx.clearRect(0, 0, width, height);

          // Get active theme dynamically
          const theme = document.documentElement.dataset.theme || 'light';

          let nodeFill: string;
          let nodeRing: string;
          let rippleColor: (alpha: number) => string;
          let lineStroke: (distRatio: number) => { color: string; width: number };

          if (theme === 'dark') {
            nodeFill = 'rgba(255, 122, 0, 0.85)';
            nodeRing = 'rgba(47, 198, 188, 0.4)';
            rippleColor = (a) => `rgba(255, 122, 0, ${a})`;
            lineStroke = (r) => ({
              color: `rgba(47, 198, 188, ${0.55 * r})`,
              width: 1.1,
            });
          } else if (theme === 'sepia') {
            nodeFill = 'rgba(181, 86, 15, 0.95)';
            nodeRing = 'rgba(106, 87, 56, 0.5)';
            rippleColor = (a) => `rgba(181, 86, 15, ${a})`;
            lineStroke = (r) => ({
              color: `rgba(80, 58, 28, ${0.68 * r})`, // Crisp warm bronze contrast for sepia
              width: 1.4,
            });
          } else {
            // 'light' (Day) theme
            nodeFill = 'rgba(217, 84, 14, 0.95)';
            nodeRing = 'rgba(14, 122, 140, 0.5)';
            rippleColor = (a) => `rgba(217, 84, 14, ${a})`;
            lineStroke = (r) => ({
              color: `rgba(14, 122, 140, ${0.75 * r})`, // Deep vivid teal contrast for day theme
              width: 1.4,
            });
          }

          // Update & draw ripples
          for (let i = ripples.length - 1; i >= 0; i--) {
            const rip = ripples[i];
            rip.r += 3.5;
            rip.alpha -= 0.02;
            if (rip.alpha <= 0) {
              ripples.splice(i, 1);
              continue;
            }
            ctx.beginPath();
            ctx.arc(rip.x, rip.y, rip.r, 0, Math.PI * 2);
            ctx.strokeStyle = rippleColor(rip.alpha);
            ctx.lineWidth = 2.0;
            ctx.stroke();
          }

          // Update & draw particles & constellation lines
          for (let i = 0; i < numParticles; i++) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;

            if (p.x < 0 || p.x > width) p.vx *= -1;
            if (p.y < 0 || p.y > height) p.vy *= -1;

            // Core particle
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fillStyle = nodeFill;
            ctx.fill();

            // Subtle outer node ring
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius + 1.5, 0, Math.PI * 2);
            ctx.strokeStyle = nodeRing;
            ctx.lineWidth = 0.8;
            ctx.stroke();

            for (let j = i + 1; j < numParticles; j++) {
              const p2 = particles[j];
              const dx = p.x - p2.x;
              const dy = p.y - p2.y;
              const dist = Math.sqrt(dx * dx + dy * dy);

              if (dist < 115) {
                const ratio = 1 - dist / 115;
                const style = lineStroke(ratio);
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.strokeStyle = style.color;
                ctx.lineWidth = style.width;
                ctx.stroke();
              }
            }
          }

          animId = requestAnimationFrame(render);
        };

        render();
      }
    }

    // -------------------------------------------------------------
    // CINEMATIC 6.5s TIMELINE SEQUENCER
    // -------------------------------------------------------------
    const updateProgress = (pct: number, statusText: string) => {
      const fillEl = document.getElementById('splash-fill');
      const statusEl = document.getElementById('splash-status');
      const pctEl = document.getElementById('splash-pct');
      if (fillEl) fillEl.style.width = `${pct}%`;
      if (statusEl) statusEl.textContent = statusText;
      if (pctEl) pctEl.textContent = `${pct}%`;
    };

    let cancelled = false;

    const fullQuote = '“Small daily study habits yield masterly academic growth.”';

    const dismissSplash = () => {
      if (cancelled) return;
      cancelled = true;
      const splashEl = document.getElementById('sayad-splash');
      if (splashEl) {
        splashEl.classList.add('splash-dissolve');
        setTimeout(() => {
          setSplashVisible(false);
          if (typeof (window as any).triggerAutoInstallPromptAfterLoading === 'function') {
            (window as any).triggerAutoInstallPromptAfterLoading();
          }
        }, 700);
      } else {
        setSplashVisible(false);
        if (typeof (window as any).triggerAutoInstallPromptAfterLoading === 'function') {
          (window as any).triggerAutoInstallPromptAfterLoading();
        }
      }
    };

    const run6SecSequence = async () => {
      // 0.0s -> 1.0s: Phase 1 (Awakening & DB Boot)
      updateProgress(12, '⚡ Initializing S.A.Y.A.D. Core Engine…');
      
      if (typeof (window as any).boot === 'function') {
        (window as any).boot().catch(console.error);
      }
      
      await new Promise((r) => setTimeout(r, 1100));
      if (cancelled) return;

      // 1.1s -> 2.8s: Phase 2 (Activating Feature Modules)
      updateProgress(28, '📄 Activating PDF Annotator & Reader…');
      setActiveChips([0]);
      await new Promise((r) => setTimeout(r, 450));
      if (cancelled) return;

      updateProgress(42, '🧠 Synchronizing FSRS Spaced Repetition engine…');
      setActiveChips([0, 1]);
      await new Promise((r) => setTimeout(r, 450));
      if (cancelled) return;

      updateProgress(58, '🤖 Connecting Gemini AI Study Assistant…');
      setActiveChips([0, 1, 2]);
      await new Promise((r) => setTimeout(r, 450));
      if (cancelled) return;

      updateProgress(68, '📈 Loading Reading Retention & Goal tracker…');
      setActiveChips([0, 1, 2, 3]);
      await new Promise((r) => setTimeout(r, 550));
      if (cancelled) return;

      // 2.9s -> 4.8s: Phase 3 (Typing Quote & FSRS Calibration)
      updateProgress(82, '🎯 Calibrating memory retrievability matrix…');
      for (let i = 1; i <= fullQuote.length; i++) {
        if (cancelled) break;
        setTypedQuote(fullQuote.slice(0, i));
        await new Promise((r) => setTimeout(r, 32));
      }
      if (cancelled) return;
      await new Promise((r) => setTimeout(r, 400));
      if (cancelled) return;

      // 4.9s -> 6.0s: Phase 4 (Workspace Ready)
      updateProgress(100, '✨ Academic Workspace Ready! Opening…');
      await new Promise((r) => setTimeout(r, 650));
      if (cancelled) return;

      // Phase 5 (Grand Entrance Reveal)
      dismissSplash();
    };

    run6SecSequence();

    (window as any).skipSplash = () => {
      dismissSplash();
    };

    return () => {
      cancelled = true;
      if (animId) cancelAnimationFrame(animId);
    };
  }, []);

  const [proTheme, setProTheme] = useState<string>(() => {
    if (typeof window !== 'undefined' && (window as any).State && (window as any).State.proTheme) {
      return (window as any).State.proTheme;
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('sayad_pro_theme') || 'classic';
    }
    return 'classic';
  });

  return (
    <>
      <main id="app" className="app-container"></main>

      {splashVisible && (
        <div id="sayad-splash" className={`sayad-splash-container splash-theme-${proTheme}`}>
          <canvas ref={canvasRef} className="splash-canvas" />

          <button
            className="splash-skip-btn"
            onClick={() => (window as any).skipSplash && (window as any).skipSplash()}
          >
            <span>Skip to Workspace</span>
            <span style={{ fontSize: '14px' }}>➔</span>
          </button>

          <div className="splash-content-wrap">
            <div className={`splash-emblem-wrap splash-emblem-${proTheme}`}>
              <div className="splash-glow-aura"></div>
              <div className="splash-orbit-outer"></div>
              <div className="splash-orbit-inner"></div>
              <div className="splash-logo-card">
                <img
                  src={typeof (window as any).getThemeCrestUrl === 'function' ? (window as any).getThemeCrestUrl() : '/icons/theme-classic-512.png'}
                  alt="S.A.Y.A.D."
                  className="splash-logo-img"
                />
              </div>
            </div>

            <div className="splash-brand-title">
              S.A.Y.A.D<span className="splash-brand-accent">.</span>
            </div>

            <div className="splash-subtitle">
              Study Assistant for Your Academic Development
            </div>

            <div className="splash-modules-grid">
              <div className={`splash-module-chip ${activeChips.includes(0) ? 'chip-active' : ''}`}>
                <span>📄</span> Smart PDF & Reader
              </div>
              <div className={`splash-module-chip ${activeChips.includes(1) ? 'chip-active' : ''}`}>
                <span>🧠</span> FSRS Flashcards
              </div>
              <div className={`splash-module-chip ${activeChips.includes(2) ? 'chip-active' : ''}`}>
                <span>🤖</span> Gemini AI Copilot
              </div>
              <div className={`splash-module-chip ${activeChips.includes(3) ? 'chip-active' : ''}`}>
                <span>📈</span> Reading Retention
              </div>
            </div>

            <div className="splash-quote-box">
              <span className="splash-quote-text">
                {typedQuote || '“Preparing your personalized academic workspace…”'}
              </span>
            </div>

            <div className="splash-progress-card">
              <div className="splash-progress-track">
                <div id="splash-fill" className="splash-progress-fill" style={{ width: '0%' }}></div>
              </div>
              <div className="splash-progress-row">
                <span id="splash-status" className="splash-status-msg">
                  ⚡ Initializing environment…
                </span>
                <span id="splash-pct" className="font-mono">
                  0%
                </span>
              </div>
            </div>

            <div className="splash-tap-tip">💡 Tap anywhere on screen for interactive energy ripples</div>
          </div>
        </div>
      )}
    </>
  );
}


