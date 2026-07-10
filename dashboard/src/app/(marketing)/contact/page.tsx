"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";

function useInView(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const { ref, visible } = useInView(0.1);
  return (
    <div ref={ref} style={{ padding: "120px 48px", maxWidth: "600px", margin: "0 auto" }}>
      <Link href="/" style={{ color: "#6b7280", fontSize: "13px", textDecoration: "none" }} className="hover-underline">
        ← Back to Home
      </Link>
      <div style={{
        opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(24px)",
        transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1)",
      }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 600,
          textTransform: "uppercase", letterSpacing: "4px", color: "#6b7280", marginTop: "24px", marginBottom: "16px",
        }}>Contact</div>
        <h1 style={{ fontSize: "clamp(36px, 5vw, 56px)", fontWeight: 400, letterSpacing: "-1.5px", color: "#fff", marginBottom: "16px" }}>
          Get in touch<span style={{ color: "#00e5ff" }}>.</span>
        </h1>
        <p style={{ fontSize: "16px", color: "#6b7280", marginBottom: "48px" }}>
          Questions about Bastion? We&apos;d love to hear from you.
        </p>
      </div>

      {submitted ? (
        <div className="animate-scale-in" style={{
          background: "#0c1018", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px",
          padding: "64px", textAlign: "center",
        }}>
          <div style={{
            width: "64px", height: "64px", borderRadius: "50%", margin: "0 auto 24px",
            background: "rgba(0,255,136,0.1)", border: "1px solid rgba(0,255,136,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: "28px",
          }}>✓</div>
          <h3 style={{ fontSize: "20px", color: "#fff", marginBottom: "8px" }}>Message sent</h3>
          <p style={{ fontSize: "14px", color: "#6b7280" }}>We&apos;ll get back to you within 24 hours.</p>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }} className="animate-fade-in-up" style={{
          background: "#0c1018", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", padding: "36px",
        }}>
          {[
            { name: "name", label: "Name", type: "text", placeholder: "Your name" },
            { name: "email", label: "Email", type: "email", placeholder: "you@company.com" },
          ].map((f) => (
            <div key={f.name} style={{ marginBottom: "20px" }}>
              <label style={{
                display: "block", fontSize: "11px", color: "#6b7280", marginBottom: "8px",
                textTransform: "uppercase", letterSpacing: "1.5px", fontFamily: "'JetBrains Mono', monospace",
              }}>{f.label}</label>
              <input type={f.type} required placeholder={f.placeholder} style={{
                width: "100%", padding: "14px 18px", background: "#111520",
                border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px",
                color: "#fff", fontSize: "14px", outline: "none",
                transition: "border-color 0.2s",
              }}
                onFocus={(e) => e.currentTarget.style.borderColor = "rgba(0,229,255,0.3)"}
                onBlur={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"}
              />
            </div>
          ))}
          <div style={{ marginBottom: "24px" }}>
            <label style={{
              display: "block", fontSize: "11px", color: "#6b7280", marginBottom: "8px",
              textTransform: "uppercase", letterSpacing: "1.5px", fontFamily: "'JetBrains Mono', monospace",
            }}>Message</label>
            <textarea required rows={5} placeholder="Tell us about your use case..." style={{
              width: "100%", padding: "14px 18px", background: "#111520",
              border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px",
              color: "#fff", fontSize: "14px", outline: "none", resize: "vertical",
              transition: "border-color 0.2s",
            }}
              onFocus={(e) => e.currentTarget.style.borderColor = "rgba(0,229,255,0.3)"}
              onBlur={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"}
            />
          </div>
          <button type="submit" className="btn-animated" style={{
            width: "100%", padding: "16px", borderRadius: "9999px", background: "#fff", color: "#0a0a0a",
            fontSize: "15px", fontWeight: 600, border: "none", cursor: "pointer",
          }}>
            Send Message
          </button>
        </form>
      )}
    </div>
  );
}
