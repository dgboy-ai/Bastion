"use client";

import React, { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
  color: string;
  phase: number;
}

interface Orb {
  x: number;
  y: number;
  r: number;
  alpha: number;
  color: string;
  phase: number;
  speed: number;
  driftX: number;
  driftY: number;
}

// Nether Theme RGB Color Tokens (Gold, Lava, Magma, Cyan)
const COLORS = ["255,170,0", "255,42,0", "255,156,0", "0,229,255"];

export default function BackgroundParticles() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const orbsRef = useRef<Orb[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let visible = true;
    function onVisibility() {
      visible = !document.hidden;
    }
    document.addEventListener("visibilitychange", onVisibility);

    let w = 0, h = 0;
    function resize() {
      if (!canvas) return;
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    const MAX_PARTICLES = 45;
    const NUM_ORBS = 5;

    function spawnParticle(): Particle {
      return {
        x: Math.random() * w,
        y: h + 10,
        vx: (Math.random() - 0.5) * 0.15,
        vy: -(0.15 + Math.random() * 0.25),
        size: 0.8 + Math.random() * 1.8,
        alpha: 0.2 + Math.random() * 0.3,
        life: 0,
        maxLife: 200 + Math.random() * 300,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        phase: Math.random() * Math.PI * 2,
      };
    }

    particlesRef.current = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = spawnParticle();
      p.y = Math.random() * h;
      p.life = Math.random() * p.maxLife;
      particlesRef.current.push(p);
    }

    orbsRef.current = [];
    for (let i = 0; i < NUM_ORBS; i++) {
      orbsRef.current.push({
        x: w * (0.1 + Math.random() * 0.8),
        y: h * (0.1 + Math.random() * 0.8),
        r: 120 + Math.random() * 150,
        alpha: 0.025 + Math.random() * 0.03,
        color: COLORS[i % COLORS.length],
        phase: Math.random() * Math.PI * 2,
        speed: 0.05 + Math.random() * 0.05,
        driftX: (Math.random() - 0.5) * 0.1,
        driftY: (Math.random() - 0.5) * 0.1,
      });
    }

    function draw() {
      if (!ctx || !canvas) return;
      if (!visible) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      ctx.clearRect(0, 0, w, h);

      // Draw floating solar-system glowing orbs
      const orbs = orbsRef.current;
      for (const o of orbs) {
        o.x += o.driftX;
        o.y += o.driftY;
        o.phase += o.speed * 0.01;
        if (o.x < -100 || o.x > w + 100) o.driftX *= -1;
        if (o.y < -100 || o.y > h + 100) o.driftY *= -1;

        const pulse = 1 + Math.sin(o.phase) * 0.12;
        const gradient = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r * pulse);
        gradient.addColorStop(0, `rgba(${o.color},${o.alpha * 1.8})`);
        gradient.addColorStop(0.5, `rgba(${o.color},${o.alpha})`);
        gradient.addColorStop(1, `rgba(${o.color},0)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(o.x - o.r * pulse, o.y - o.r * pulse, o.r * 2 * pulse, o.r * 2 * pulse);
      }

      // Draw floating constellation particles
      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx + Math.sin(p.phase + p.life * 0.01) * 0.1;
        p.y += p.vy;
        p.life++;
        const lifeRatio = p.life / p.maxLife;
        const fade = (1 - lifeRatio) * p.alpha * 0.5;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.color},${fade})`;
        ctx.fill();

        if (p.life >= p.maxLife || p.y < -20 || p.x < -40 || p.x > w + 40) {
          particles[i] = spawnParticle();
        }
      }

      // Draw constellation links
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(255,255,255,${(1 - dist / 120) * 0.035})`;
            ctx.stroke();
          }
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: -3, // Under panels and grid lines
        opacity: 0.95,
      }}
    />
  );
}
