"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MeshGradient, PulsingBorder } from "@paper-design/shaders-react";
import { motion } from "framer-motion";

const PARTICLES = [
  { left: "24%", top: "28%", x: 8 },
  { left: "38%", top: "18%", x: -7 },
  { left: "54%", top: "34%", x: 10 },
  { left: "70%", top: "24%", x: -9 },
  { left: "30%", top: "58%", x: 6 },
  { left: "62%", top: "62%", x: -6 },
];

export default function ShaderShowcase() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    const handleMouseEnter = () => setIsActive(true);
    const handleMouseLeave = () => setIsActive(false);

    const container = containerRef.current;
    if (container) {
      container.addEventListener("mouseenter", handleMouseEnter);
      container.addEventListener("mouseleave", handleMouseLeave);
    }

    return () => {
      if (container) {
        container.removeEventListener("mouseenter", handleMouseEnter);
        container.removeEventListener("mouseleave", handleMouseLeave);
      }
    };
  }, []);

  return (
    <div ref={containerRef} className="relative min-h-[92dvh] overflow-hidden bg-black text-white">
      <svg className="absolute inset-0 h-0 w-0">
        <defs>
          <filter id="glass-effect" x="-50%" y="-50%" width="200%" height="200%">
            <feTurbulence baseFrequency="0.005" numOctaves="1" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.3" />
            <feColorMatrix
              type="matrix"
              values="1 0 0 0 0.02
                      0 1 0 0 0.02
                      0 0 1 0 0.05
                      0 0 0 0.9 0"
              result="tint"
            />
          </filter>
          <filter id="gooey-filter" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9"
              result="gooey"
            />
            <feComposite in="SourceGraphic" in2="gooey" operator="atop" />
          </filter>
          <filter id="logo-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="hero-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="30%" stopColor="#06b6d4" />
            <stop offset="70%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#ffffff" />
          </linearGradient>
          <filter id="text-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>

      <MeshGradient
        className="absolute inset-0 h-full w-full"
        colors={["#000000", "#06b6d4", "#0891b2", "#164e63", "#f97316"]}
        speed={0.3}
        distortion={0.92}
        swirl={0.22}
        grainOverlay={0.08}
      />
      <MeshGradient
        className="absolute inset-0 h-full w-full opacity-60"
        colors={["#000000", "#ffffff", "#06b6d4", "#f97316"]}
        speed={0.2}
        distortion={0.45}
        swirl={0.7}
        grainMixer={0.18}
      />
      <div className="absolute inset-0 bg-black/25" aria-hidden />

      <header className="relative z-20 flex items-center justify-between p-5 sm:p-6">
        <motion.div
          className="group relative flex cursor-pointer items-center gap-3"
          whileHover={{ scale: 1.04 }}
          transition={{ type: "spring", stiffness: 400, damping: 14 }}
        >
          <Link href="/" className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-mark.png"
              alt=""
              className="h-10 w-10 object-contain transition-all duration-300 group-hover:drop-shadow-lg"
              style={{ filter: "url(#logo-glow)" }}
            />
            <span className="hidden text-sm font-semibold tracking-wide text-white/90 sm:inline">Craft&apos;d</span>
          </Link>

          <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            {PARTICLES.map((particle, i) => (
              <motion.div
                key={i}
                className="absolute h-1 w-1 rounded-full bg-white/60"
                style={{ left: particle.left, top: particle.top }}
                animate={{
                  y: [-10, -20, -10],
                  x: [0, particle.x, 0],
                  opacity: [0, 1, 0],
                  scale: [0, 1, 0],
                }}
                transition={{
                  duration: 2,
                  repeat: Number.POSITIVE_INFINITY,
                  delay: i * 0.2,
                  ease: "easeInOut",
                }}
              />
            ))}
          </div>
        </motion.div>

        <nav className="hidden items-center space-x-2 sm:flex">
          <a
            href="#workflow"
            className="rounded-full px-3 py-2 text-xs font-light text-white/80 transition-all duration-200 hover:bg-white/10 hover:text-white"
          >
            Workflow
          </a>
          <a
            href="#setup"
            className="rounded-full px-3 py-2 text-xs font-light text-white/80 transition-all duration-200 hover:bg-white/10 hover:text-white"
          >
            Setup
          </a>
          <a
            href="#integrations"
            className="rounded-full px-3 py-2 text-xs font-light text-white/80 transition-all duration-200 hover:bg-white/10 hover:text-white"
          >
            Integrations
          </a>
        </nav>

        <div id="gooey-btn" className="group relative flex items-center" style={{ filter: "url(#gooey-filter)" }}>
          <Link
            href="/app"
            aria-label="Open app"
            className="absolute right-0 z-0 flex h-8 -translate-x-10 cursor-pointer items-center justify-center rounded-full bg-white px-2.5 py-2 text-xs font-normal text-black transition-all duration-300 hover:bg-white/90 group-hover:-translate-x-[4.75rem]"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 17L17 7M17 7H7M17 7V17" />
            </svg>
          </Link>
          <Link
            href="/app"
            className="z-10 flex h-8 cursor-pointer items-center rounded-full bg-white px-6 py-2 text-xs font-normal text-black transition-all duration-300 hover:bg-white/90"
          >
            Open app
          </Link>
        </div>
      </header>

      <main className="absolute bottom-8 left-5 right-5 z-20 max-w-3xl sm:left-8 sm:right-auto">
        <div className="text-left">
          <motion.div
            className="relative mb-6 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-sm"
            style={{ filter: "url(#glass-effect)" }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className="absolute left-1 right-1 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent" />
            <span className="relative z-10 text-sm font-medium tracking-wide text-white/90">
              Event follow-up workspace
            </span>
          </motion.div>

          <motion.h1
            className="mb-6 text-5xl font-bold leading-none tracking-normal text-white sm:text-7xl lg:text-8xl"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            <motion.span
              className="mb-2 block text-3xl font-light tracking-normal text-white/90 sm:text-5xl lg:text-6xl"
              style={{
                background: "linear-gradient(135deg, #ffffff 0%, #06b6d4 30%, #f97316 70%, #ffffff 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                filter: "url(#text-glow)",
              }}
              animate={{
                backgroundPosition: isActive ? ["0% 50%", "100% 50%", "0% 50%"] : "0% 50%",
              }}
              transition={{
                duration: 8,
                repeat: Number.POSITIVE_INFINITY,
                ease: "linear",
              }}
            >
              Meet someone.
            </motion.span>
            <span className="block font-black text-white drop-shadow-2xl">Craft the</span>
            <span className="block font-light italic text-white/80">follow-up.</span>
          </motion.h1>

          <motion.p
            className="mb-8 max-w-xl text-base font-light leading-relaxed text-white/75 sm:text-lg"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.8 }}
          >
            Capture a name, company, or card photo. Craft&apos;d queues the research, checks what it can, and returns a brief with outreach drafts you can review.
          </motion.p>

          <motion.div
            className="flex flex-wrap items-center gap-4 sm:gap-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.0 }}
          >
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Link
                href="#setup"
                className="inline-flex cursor-pointer rounded-full border-2 border-white/30 bg-transparent px-8 py-3 text-sm font-medium text-white backdrop-blur-sm transition-all duration-300 hover:border-cyan-400/50 hover:bg-white/10 hover:text-cyan-100 sm:px-10 sm:py-4"
              >
                See setup
              </Link>
            </motion.div>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Link
                href="/app"
                className="inline-flex cursor-pointer rounded-full bg-gradient-to-r from-cyan-500 to-orange-500 px-8 py-3 text-sm font-semibold text-white shadow-lg transition-all duration-300 hover:from-cyan-400 hover:to-orange-400 hover:shadow-xl sm:px-10 sm:py-4"
              >
                Open app
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </main>

      <div className="absolute bottom-8 right-8 z-30 hidden sm:block">
        <div className="relative flex h-20 w-20 items-center justify-center">
          <PulsingBorder
            colors={["#06b6d4", "#0891b2", "#f97316", "#00FF88", "#FFD700", "#FF6B35", "#ffffff"]}
            colorBack="#00000000"
            speed={1.5}
            roundness={1}
            thickness={0.1}
            softness={0.2}
            intensity={5}
            spots={5}
            spotSize={0.1}
            pulse={0.1}
            smoke={0.5}
            smokeSize={4}
            scale={0.65}
            rotation={0}
            frame={9161408.251009725}
            style={{
              width: "60px",
              height: "60px",
              borderRadius: "50%",
            }}
          />

          <motion.svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            animate={{ rotate: 360 }}
            transition={{
              duration: 20,
              repeat: Number.POSITIVE_INFINITY,
              ease: "linear",
            }}
            style={{ transform: "scale(1.6)" }}
          >
            <defs>
              <path id="circle" d="M 50, 50 m -38, 0 a 38,38 0 1,1 76,0 a 38,38 0 1,1 -76,0" />
            </defs>
            <text className="fill-white/80 text-sm font-medium">
              <textPath href="#circle" startOffset="0%">
                Craft&apos;d • brief • roles • outreach • research •
              </textPath>
            </text>
          </motion.svg>
        </div>
      </div>
    </div>
  );
}
