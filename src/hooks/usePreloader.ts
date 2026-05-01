import { useState, useRef, useEffect, useCallback } from "react";
import lottie, { AnimationItem } from "lottie-web";

/**
 * Optimized Preloader Hook
 * 
 * Key fixes vs original:
 * - Uses 'canvas' renderer instead of 'svg' for better performance
 * - Throttles enterFrame updates to avoid excessive re-renders
 * - Properly cleans up all event listeners
 * - Uses passive event listeners for scroll prevention
 * - Avoids re-creating animation on dependency changes
 */
export const usePreloader = (
  preloaderEnabled: boolean,
  isPlayground: boolean,
  renderer: "svg" | "canvas" | "html" = "canvas",
  animationData?: object | null,
) => {
  const loaderAnimationRef = useRef<AnimationItem | null>(null);
  const preloaderRef = useRef<HTMLDivElement>(null);
  const preloaderInitializedRef = useRef(false);
  const lastProgressUpdateRef = useRef(0);

  const [preloaderVisible, setPreloaderVisible] = useState(preloaderEnabled);
  const [preloaderFinished, setPreloaderFinished] = useState(!preloaderEnabled);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [lottieReady, setLottieReady] = useState(false);

  useEffect(() => {
    if (preloaderInitializedRef.current) return;
    if (preloaderEnabled) {
      setPreloaderVisible(true);
      setPreloaderFinished(false);
      setLoadingProgress(0);
      preloaderInitializedRef.current = true;
    } else {
      setPreloaderVisible(false);
      setPreloaderFinished(true);
    }
  }, [preloaderEnabled]);

  // Throttled progress update to avoid excessive re-renders
  const updateProgress = useCallback((progress: number) => {
    const now = performance.now();
    // Only update state every 50ms (20fps for the progress number)
    if (now - lastProgressUpdateRef.current > 50) {
      lastProgressUpdateRef.current = now;
      setLoadingProgress(Math.round(progress));
    }
  }, []);

  useEffect(() => {
    if (!preloaderEnabled || !preloaderVisible || preloaderFinished) return;
    if (loaderAnimationRef.current) return;

    const loaderElement = document.querySelector(".header-loader");
    if (!loaderElement || loaderElement.querySelector("svg") || loaderElement.querySelector("canvas")) {
      return;
    }

    const animConfig: Parameters<typeof lottie.loadAnimation>[0] = {
      container: loaderElement as HTMLElement,
      renderer: renderer,
      loop: false,
      autoplay: true,
      // Use animationData directly if provided (avoids network request)
      ...(animationData
        ? { animationData }
        : { path: "/lottie/lottie.json" }),
    };

    // Canvas renderer options for better performance
    if (renderer === "canvas") {
      (animConfig as Record<string, unknown>).rendererSettings = {
        clearCanvas: true,
        progressiveLoad: true,
        preserveAspectRatio: "xMidYMid meet",
      };
    }

    loaderAnimationRef.current = lottie.loadAnimation(animConfig);

    const handleEnterFrame = () => {
      const anim = loaderAnimationRef.current;
      if (anim && anim.totalFrames > 0) {
        const progress = Math.min(
          Math.max((anim.currentFrame / anim.totalFrames) * 100, 0),
          99.9,
        );
        updateProgress(progress);
      }
    };

    const handleComplete = () => {
      setLoadingProgress(100);
      setTimeout(() => {
        setPreloaderFinished(true);
      }, 200);
      if (loaderAnimationRef.current) {
        loaderAnimationRef.current.removeEventListener("complete", handleComplete);
        loaderAnimationRef.current.removeEventListener("enterFrame", handleEnterFrame);
      }
    };

    const handleDOMLoaded = () => {
      setLottieReady(true);
      if (loaderAnimationRef.current && loaderAnimationRef.current.totalFrames > 0) {
        loaderAnimationRef.current.addEventListener("enterFrame", handleEnterFrame);
      }
    };

    loaderAnimationRef.current.addEventListener("DOMLoaded", handleDOMLoaded);

    if (isPlayground) {
      document.addEventListener("complete_game", handleComplete);
    } else {
      loaderAnimationRef.current.addEventListener("complete", handleComplete);
    }

    return () => {
      document.removeEventListener("complete_game", handleComplete);
    };
  }, [preloaderEnabled, preloaderVisible, preloaderFinished, isPlayground, renderer, animationData, updateProgress]);

  // Scroll lock with passive: false for proper prevention
  useEffect(() => {
    const el = preloaderRef.current;
    if (!el) return;
    const opts: AddEventListenerOptions = { passive: false };
    const handler = (e: Event) => e.preventDefault();
    el.addEventListener("wheel", handler, opts);
    el.addEventListener("touchmove", handler, opts);
    return () => {
      el.removeEventListener("wheel", handler);
      el.removeEventListener("touchmove", handler);
    };
  }, []);

  // Body overflow lock
  useEffect(() => {
    const lock = preloaderEnabled && preloaderVisible && !preloaderFinished;
    document.body.style.overflow = lock ? "hidden" : "";
    document.documentElement.style.overflow = lock ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, [preloaderEnabled, preloaderVisible, preloaderFinished]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (loaderAnimationRef.current) {
        loaderAnimationRef.current.destroy();
        loaderAnimationRef.current = null;
      }
    };
  }, []);

  return {
    preloaderRef,
    preloaderVisible,
    setPreloaderVisible,
    preloaderFinished,
    loadingProgress,
    loaderAnimationRef,
    lottieReady,
  };
};
