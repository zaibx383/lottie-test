import { useRef, useEffect, useState } from "react";
import lottie, { type AnimationItem } from "lottie-web";
import "./index.css";

type RendererType = "svg" | "canvas" | "html";
interface LogEntry { time: string; msg: string; type: "info" | "warn" | "error" | "perf"; }

function ts() {
  return new Date().toLocaleTimeString("en-US", { hour12: false, fractionalSecondDigits: 3 });
}

function App() {
  const [animData, setAnimData] = useState<Record<string, unknown> | null>(null);
  const [renderer, setRenderer] = useState<RendererType>("svg");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fps, setFps] = useState(0);
  const [frameInfo, setFrameInfo] = useState("");

  const animRef = useRef<AnimationItem | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const fpsTimestamps = useRef<number[]>([]);
  const rafId = useRef(0);

  const log = (msg: string, type: LogEntry["type"] = "info") => {
    setLogs(prev => [...prev, { time: ts(), msg, type }]);
  };

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // FPS counter via rAF
  useEffect(() => {
    const tick = (now: number) => {
      fpsTimestamps.current.push(now);
      const cutoff = now - 1000;
      while (fpsTimestamps.current.length > 0 && fpsTimestamps.current[0] < cutoff) {
        fpsTimestamps.current.shift();
      }
      setFps(fpsTimestamps.current.length);
      rafId.current = requestAnimationFrame(tick);
    };
    rafId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId.current);
  }, []);

  const loadAnim = (data: Record<string, unknown>, rendererType: RendererType) => {
    // Destroy previous
    if (animRef.current) {
      animRef.current.destroy();
      animRef.current = null;
      log("Destroyed previous animation instance");
    }
    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";

    // Analyze JSON
    const layers = (data.layers as unknown[]) || [];
    const assets = (data.assets as unknown[]) || [];
    const fr = (data.fr as number) || 30;
    const w = (data.w as number) || 0;
    const h = (data.h as number) || 0;
    const op = (data.op as number) || 0;
    const ip = (data.ip as number) || 0;
    const totalFrames = op - ip;
    const duration = totalFrames / fr;
    const sizeBytes = new Blob([JSON.stringify(data)]).size;
    const sizeKB = (sizeBytes / 1024).toFixed(1);

    log(`--- JSON Analysis ---`, "info");
    log(`Name: ${data.nm || "unnamed"}`, "info");
    log(`Dimensions: ${w}x${h}`, "info");
    log(`Frame rate: ${fr} fps`, fr > 30 ? "warn" : "info");
    log(`Total frames: ${totalFrames} (ip:${ip} op:${op})`, "info");
    log(`Duration: ${duration.toFixed(2)}s`, "info");
    log(`Layers: ${layers.length}`, layers.length > 20 ? "warn" : "info");
    log(`Assets: ${assets.length}`, "info");
    log(`File size: ${sizeKB} KB`, parseFloat(sizeKB) > 500 ? "warn" : "info");
    log(`Lottie version: ${data.v || "unknown"}`, "info");

    // Check for image assets
    const imageAssets = assets.filter((a: unknown) => {
      const asset = a as Record<string, unknown>;
      return asset.p && typeof asset.p === "string" && /\.(png|jpg|jpeg|webp|gif)/i.test(asset.p as string);
    });
    if (imageAssets.length > 0) {
      log(`⚠ Contains ${imageAssets.length} embedded image(s) — can cause lag`, "warn");
    }

    // Check for expressions
    const jsonStr = JSON.stringify(data);
    if (jsonStr.includes('"x"') && jsonStr.includes('"ix"')) {
      log(`⚠ May contain expressions — these are CPU-heavy`, "warn");
    }

    // Layer breakdown
    log(`--- Layer Breakdown ---`, "info");
    layers.forEach((layer: unknown, i: number) => {
      const l = layer as Record<string, unknown>;
      const types: Record<number, string> = { 0: "precomp", 1: "solid", 2: "image", 3: "null", 4: "shape", 5: "text", 6: "audio", 13: "camera" };
      const typeName = types[(l.ty as number)] || `type:${l.ty}`;
      const hidden = l.hd ? " [HIDDEN]" : "";
      const hasMask = (l.hasMask || l.masksProperties) ? " [MASKED]" : "";
      const blendMode = (l.bm as number) > 0 ? ` [blend:${l.bm}]` : "";
      log(`  L${i}: "${l.nm}" (${typeName})${hidden}${hasMask}${blendMode}`, "info");
    });

    // Intercept console to catch lottie-web internal errors
    const origError = console.error;
    const origWarn = console.warn;
    console.error = (...args: unknown[]) => {
      log(`[console.error] ${args.map(a => String(a)).join(" ")}`, "error");
      origError.apply(console, args);
    };
    console.warn = (...args: unknown[]) => {
      log(`[console.warn] ${args.map(a => String(a)).join(" ")}`, "warn");
      origWarn.apply(console, args);
    };

    // Load animation
    log(`--- Loading with ${rendererType.toUpperCase()} renderer ---`, "perf");
    const t0 = performance.now();

    let anim: AnimationItem;
    try {
      anim = lottie.loadAnimation({
        container: containerRef.current,
        renderer: rendererType,
        loop: true,
        autoplay: true,
        animationData: data,
      });
    } catch (err) {
      log(`loadAnimation threw: ${err}`, "error");
      console.error = origError;
      console.warn = origWarn;
      return;
    }

    animRef.current = anim;

    anim.addEventListener("DOMLoaded", () => {
      const loadTime = (performance.now() - t0).toFixed(1);
      log(`DOMLoaded in ${loadTime}ms`, parseFloat(loadTime) > 200 ? "warn" : "perf");
      log(`Total frames (from anim): ${anim.totalFrames}`, "info");
      setIsPlaying(true);
    });

    anim.addEventListener("enterFrame", () => {
      const cf = Math.round(anim.currentFrame);
      const tf = Math.round(anim.totalFrames);
      setFrameInfo(`${cf} / ${tf}`);
    });

    anim.addEventListener("loopComplete", () => {
      log(`Loop completed`, "info");
    });

    anim.addEventListener("complete", () => {
      log(`Animation complete`, "info");
    });

    // Capture the actual error details
    anim.addEventListener("error", (err: unknown) => {
      const e = err as Record<string, unknown>;
      const native = e.nativeError as Error | undefined;
      log(`--- RENDER ERROR at frame ${e.currentTime} ---`, "error");
      log(`Error type: ${e.type}`, "error");
      if (native) {
        log(`Native error message: ${native.message || "(none)"}`, "error");
        log(`Native error name: ${native.name || "(none)"}`, "error");
        if (native.stack) {
          const stackLines = native.stack.split("\n").slice(0, 5);
          stackLines.forEach(line => log(`  ${line.trim()}`, "error"));
        }
      }
      // Show which layers are active at this frame
      const frame = e.currentTime as number;
      const layersData = (data.layers as Array<Record<string, unknown>>) || [];
      log(`Layers active at frame ${frame}:`, "warn");
      layersData.forEach((l, i) => {
        const ip = (l.ip as number) || 0;
        const op = (l.op as number) || 0;
        const st = (l.st as number) || 0;
        if (frame >= ip && frame < op) {
          const isTransition = Math.abs(frame - ip) < 2 || Math.abs(frame - op) < 2;
          log(`  L${i}: "${l.nm}" (ip:${ip} op:${op} st:${st})${isTransition ? " ← TRANSITIONING" : ""}`, isTransition ? "warn" : "info");
        }
      });
    });

    // Restore console after 5s (enough to catch init errors)
    setTimeout(() => {
      console.error = origError;
      console.warn = origWarn;
    }, 5000);

    // Check DOM complexity after a short delay
    setTimeout(() => {
      if (!containerRef.current) return;
      if (rendererType === "svg") {
        const svgEl = containerRef.current.querySelector("svg");
        if (svgEl) {
          const nodeCount = svgEl.querySelectorAll("*").length;
          log(`SVG DOM node count: ${nodeCount}`, nodeCount > 500 ? "warn" : "perf");
          if (nodeCount > 500) {
            log(`⚠ High SVG node count — this causes jank. Try canvas renderer.`, "warn");
          }
        }
      }
      if (rendererType === "canvas") {
        const canvasEl = containerRef.current.querySelector("canvas");
        if (canvasEl) {
          log(`Canvas size: ${canvasEl.width}x${canvasEl.height}`, "perf");
        }
      }
    }, 500);
  };

  const handleFile = (file: File) => {
    setLogs([]);
    log(`Loading file: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        setAnimData(data);
        loadAnim(data, renderer);
      } catch (err) {
        log(`Failed to parse JSON: ${err}`, "error");
      }
    };
    reader.readAsText(file);
  };

  const switchRenderer = (r: RendererType) => {
    setRenderer(r);
    if (animData) {
      log(`\n--- Switching to ${r.toUpperCase()} ---`, "perf");
      loadAnim(animData, r);
    }
  };

  const togglePlay = () => {
    if (!animRef.current) return;
    if (isPlaying) {
      animRef.current.pause();
      log("Paused", "info");
    } else {
      animRef.current.play();
      log("Playing", "info");
    }
    setIsPlaying(!isPlaying);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="app">
      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-left">
          <button onClick={() => fileInputRef.current?.click()}>Load JSON</button>
          <button onClick={async () => {
            setLogs([]);
            log("Fetching /lottie_1.json from public/...");
            try {
              const resp = await fetch("/lottie_1.json?" + Date.now());
              const data = await resp.json();
              setAnimData(data);
              loadAnim(data, renderer);
            } catch (err) {
              log(`Failed to fetch: ${err}`, "error");
            }
          }}>Load Fixed</button>
          <input ref={fileInputRef} type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
          <span className="separator">|</span>
          {(["svg", "canvas", "html"] as RendererType[]).map(r => (
            <button key={r} className={renderer === r ? "active" : ""} onClick={() => switchRenderer(r)}>
              {r.toUpperCase()}
            </button>
          ))}
          <span className="separator">|</span>
          <button onClick={togglePlay}>{isPlaying ? "Pause" : "Play"}</button>
          <button onClick={() => { if (animRef.current) { animRef.current.stop(); setIsPlaying(false); log("Stopped"); } }}>Stop</button>
        </div>
        <div className="toolbar-right">
          <span className={`fps-display ${fps >= 50 ? "good" : fps >= 30 ? "ok" : "bad"}`}>{fps} FPS</span>
          {frameInfo && <span className="frame-display">{frameInfo}</span>}
        </div>
      </div>

      {/* Main Area */}
      <div className="main">
        {/* Animation */}
        <div className="preview" onDragOver={e => e.preventDefault()} onDrop={onDrop}>
          {!animData && <div className="placeholder">Drop a .json file here or click "Load JSON"</div>}
          <div ref={containerRef} className="lottie-container" />
        </div>

        {/* Debug Log */}
        <div className="log-panel">
          <div className="log-header">
            <span>Debug Log</span>
            <button onClick={() => setLogs([])}>Clear</button>
          </div>
          <div className="log-content" ref={logRef}>
            {logs.length === 0 && <div className="log-empty">Load a Lottie JSON to see diagnostics...</div>}
            {logs.map((entry, i) => (
              <div key={i} className={`log-line ${entry.type}`}>
                <span className="log-time">{entry.time}</span>
                <span className="log-msg">{entry.msg}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
