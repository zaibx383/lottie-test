import { useRef, useEffect, useState, useCallback } from "react";
import lottie, { AnimationItem } from "lottie-web";
import "./preloader-test.css";

/**
 * PreloaderTest — Simulates the exact production preloader experience.
 *
 * Renders the Lottie animation as a full-screen loading overlay,
 * then fades out to reveal a mock website beneath it.
 * Includes a control panel to replay, switch renderers, and view diagnostics.
 */

type RendererType = "svg" | "canvas" | "html";

function PreloaderTest() {
  const [phase, setPhase] = useState<"loading" | "fading" | "done">("loading");
  const [renderer, setRenderer] = useState<RendererType>("svg");
  const [progress, setProgress] = useState(0);
  const [showPanel, setShowPanel] = useState(false);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [animSource, setAnimSource] = useState<"lottie" | "lottie_1">("lottie");

  const animRef = useRef<AnimationItem | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isLoadingRef = useRef(false);
  const lastProgressUpdate = useRef(0);

  const addDiag = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString("en-US", {
      hour12: false,
      fractionalSecondDigits: 3,
    });
    setDiagnostics((prev) => [...prev, `[${time}] ${msg}`]);
  }, []);

  const loadAnimation = useCallback(
    async (rendererType: RendererType, source: "lottie" | "lottie_1") => {
      // Prevent concurrent loads
      if (isLoadingRef.current) return;
      isLoadingRef.current = true;

      // Aggressive Cleanup
      if (animRef.current) {
        animRef.current.destroy();
        animRef.current = null;
      }
      
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }

      setPhase("loading");
      setProgress(0);
      setDiagnostics([]);

      const animPath =
        source === "lottie" ? "/lottie/lottie.json" : "/lottie_1.json";

      addDiag(`Preparing ${animPath}...`);
      
      try {
        const resp = await fetch(animPath + "?" + Date.now());
        const data = await resp.json();

        // Final check if we should still be loading this
        if (!containerRef.current) {
          isLoadingRef.current = false;
          return;
        }

        // HIDE THE "LINE" LAYER (the dashes)
        if (data.layers) {
          data.layers = data.layers.map((layer: any) => {
            if (layer.nm === "Line") return { ...layer, hd: true };
            return layer;
          });
        }

        const t0 = performance.now();
        addDiag(`Loading with ${rendererType.toUpperCase()} renderer`);

        // Ensure container is empty one last time before mounting
        containerRef.current.innerHTML = "";

        const animConfig: Parameters<typeof lottie.loadAnimation>[0] = {
          container: containerRef.current,
          renderer: rendererType,
          loop: false,
          autoplay: true,
          animationData: data,
        };

        if (rendererType === "canvas") {
          (animConfig as Record<string, unknown>).rendererSettings = {
            clearCanvas: true,
            progressiveLoad: true,
            preserveAspectRatio: "xMidYMid meet",
          };
        }

        const anim = lottie.loadAnimation(animConfig);
        animRef.current = anim;

        anim.addEventListener("DOMLoaded", () => {
          const loadTime = (performance.now() - t0).toFixed(1);
          addDiag(
            `DOMLoaded in ${loadTime}ms | Frames: ${anim.totalFrames} | Size: ${containerRef.current?.offsetWidth}x${containerRef.current?.offsetHeight}`
          );
        });

        anim.addEventListener("enterFrame", () => {
          if (anim.totalFrames > 0) {
            const now = performance.now();
            if (now - lastProgressUpdate.current > 50) {
              lastProgressUpdate.current = now;
              const p = Math.min(
                Math.max(
                  (anim.currentFrame / anim.totalFrames) * 100,
                  0
                ),
                99.9
              );
              setProgress(Math.round(p));
            }
          }
        });

        anim.addEventListener("complete", () => {
          addDiag("Animation complete — starting fade-out");
          setProgress(100);
          setPhase("fading");
          setTimeout(() => {
            setPhase("done");
            addDiag("Preloader dismissed — website content revealed");
          }, 800);
        });

        anim.addEventListener("error", (err: unknown) => {
          const e = err as Record<string, unknown>;
          addDiag(`❌ RENDER ERROR at frame ${e.currentTime}: ${e.type}`);
        });

        isLoadingRef.current = false;
      } catch (err) {
        addDiag(`❌ Failed to load animation: ${err}`);
        isLoadingRef.current = false;
      }
    },
    [addDiag]
  );

  // Initial load
  useEffect(() => {
    loadAnimation(renderer, animSource);
    return () => {
      if (animRef.current) {
        animRef.current.destroy();
        animRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Body overflow lock during preloader
  useEffect(() => {
    if (phase !== "done") {
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, [phase]);

  const handleReplay = () => {
    loadAnimation(renderer, animSource);
  };

  const handleRendererChange = (r: RendererType) => {
    setRenderer(r);
    loadAnimation(r, animSource);
  };

  const handleSourceChange = (s: "lottie" | "lottie_1") => {
    setAnimSource(s);
    loadAnimation(renderer, s);
  };

  return (
    <div className="preloader-test">
      {/* ========== PRELOADER OVERLAY ========== */}
      <div
        className={`preloader-overlay ${phase === "fading" ? "fade-out" : ""} ${phase === "done" ? "hidden" : ""}`}
      >
        {/* The Lottie animation container — matches production .header-loader */}
        <div ref={containerRef} className="header-loader" />

        {/* Progress indicator */}
        <div className="preloader-progress">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="progress-text">{progress}%</span>
        </div>
      </div>

      {/* ========== MOCK WEBSITE CONTENT (revealed after preloader) ========== */}
      <div className="mock-website">
        <nav className="mock-nav">
          <div className="mock-logo">
            <div className="logo-icon" />
            <span>YourBrand</span>
          </div>
          <div className="mock-nav-links">
            <a href="#">Home</a>
            <a href="#">About</a>
            <a href="#">Services</a>
            <a href="#">Contact</a>
          </div>
        </nav>

        <section className="mock-hero">
          <div className="hero-content">
            <span className="hero-tag">Welcome</span>
            <h1>This is your website</h1>
            <p>
              The preloader animation has finished. This is the content that
              users would see after the loading screen completes.
            </p>
            <div className="hero-cta-row">
              <button className="cta-primary" onClick={handleReplay}>
                ↻ Replay Preloader
              </button>
              <button
                className="cta-secondary"
                onClick={() => setShowPanel(!showPanel)}
              >
                {showPanel ? "Hide" : "Show"} Diagnostics
              </button>
            </div>
          </div>
          <div className="hero-visual">
            <div className="floating-card card-1" />
            <div className="floating-card card-2" />
            <div className="floating-card card-3" />
          </div>
        </section>

        <section className="mock-features">
          <div className="feature-card">
            <div className="feature-icon">🎨</div>
            <h3>SVG Renderer</h3>
            <p>Crisp vector rendering, ideal for desktop with low layer count.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">⚡</div>
            <h3>Canvas Renderer</h3>
            <p>GPU-accelerated, best for complex animations and mobile devices.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🔍</div>
            <h3>Cross-Browser</h3>
            <p>Test on Safari, Chrome, Firefox, Edge — all from BrowserStack.</p>
          </div>
        </section>
      </div>

      {/* ========== CONTROL PANEL (floating) ========== */}
      {showPanel && (
        <div className="control-panel">
          <div className="panel-header">
            <span>🧪 Test Controls</span>
            <button className="panel-close" onClick={() => setShowPanel(false)}>
              ✕
            </button>
          </div>

          <div className="panel-section">
            <label>Renderer</label>
            <div className="btn-group">
              {(["svg", "canvas", "html"] as RendererType[]).map((r) => (
                <button
                  key={r}
                  className={renderer === r ? "active" : ""}
                  onClick={() => handleRendererChange(r)}
                >
                  {r.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="panel-section">
            <label>Animation Source</label>
            <div className="btn-group">
              <button
                className={animSource === "lottie" ? "active" : ""}
                onClick={() => handleSourceChange("lottie")}
              >
                lottie.json
              </button>
              <button
                className={animSource === "lottie_1" ? "active" : ""}
                onClick={() => handleSourceChange("lottie_1")}
              >
                lottie_1.json (fixed)
              </button>
            </div>
          </div>

          <div className="panel-section">
            <button className="replay-btn" onClick={handleReplay}>
              ↻ Replay Animation
            </button>
          </div>

          <div className="panel-section diagnostics">
            <label>Diagnostics</label>
            <div className="diag-log">
              {diagnostics.length === 0 && (
                <span className="diag-empty">No events yet…</span>
              )}
              {diagnostics.map((d, i) => (
                <div key={i} className="diag-line">
                  {d}
                </div>
              ))}
            </div>
          </div>

          <div className="panel-section browser-info">
            <label>Browser Info</label>
            <div className="diag-log">
              <div className="diag-line">
                UA: {navigator.userAgent.slice(0, 120)}…
              </div>
              <div className="diag-line">
                Screen: {window.screen.width}x{window.screen.height} @{" "}
                {window.devicePixelRatio}x
              </div>
              <div className="diag-line">
                Viewport: {window.innerWidth}x{window.innerHeight}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating replay button (always visible once done) */}
      {phase === "done" && !showPanel && (
        <button className="floating-replay" onClick={handleReplay} title="Replay preloader">
          ↻
        </button>
      )}
    </div>
  );
}

export default PreloaderTest;
