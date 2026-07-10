"use client";

import Link from "next/link";
import { useState } from "react";

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  return (
    <div style={{ padding: "120px 48px", maxWidth: "600px", margin: "0 auto" }}>
      <Link href="/" style={{ color: "#7d8187", fontSize: "13px", textDecoration: "none" }}>← Back to Home</Link>
      <h1 style={{ fontSize: "48px", fontWeight: 400, letterSpacing: "-1.2px", color: "#fff", marginTop: "24px", marginBottom: "16px" }}>
        Contact
      </h1>
      <p style={{ fontSize: "16px", color: "#7d8187", marginBottom: "48px" }}>
        Questions about Bastion? Reach out to the team.
      </p>
      {submitted ? (
        <div style={{
          background: "#191919", border: "1px solid #212327", borderRadius: "8px",
          padding: "48px", textAlign: "center",
        }}>
          <div style={{ fontSize: "32px", marginBottom: "16px" }}>✓</div>
          <h3 style={{ fontSize: "18px", color: "#fff", marginBottom: "8px" }}>Message sent</h3>
          <p style={{ fontSize: "14px", color: "#7d8187" }}>We&apos;ll get back to you soon.</p>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }} style={{
          background: "#191919", border: "1px solid #212327", borderRadius: "8px", padding: "32px",
        }}>
          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", fontSize: "12px", color: "#7d8187", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "1px" }}>Name</label>
            <input type="text" required style={{
              width: "100%", padding: "12px 16px", background: "#1a1c20", border: "1px solid #212327",
              borderRadius: "8px", color: "#fff", fontSize: "14px", outline: "none",
            }} />
          </div>
          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", fontSize: "12px", color: "#7d8187", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "1px" }}>Email</label>
            <input type="email" required style={{
              width: "100%", padding: "12px 16px", background: "#1a1c20", border: "1px solid #212327",
              borderRadius: "8px", color: "#fff", fontSize: "14px", outline: "none",
            }} />
          </div>
          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", fontSize: "12px", color: "#7d8187", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "1px" }}>Message</label>
            <textarea required rows={5} style={{
              width: "100%", padding: "12px 16px", background: "#1a1c20", border: "1px solid #212327",
              borderRadius: "8px", color: "#fff", fontSize: "14px", outline: "none", resize: "vertical",
            }} />
          </div>
          <button type="submit" style={{
            width: "100%", padding: "14px", borderRadius: "9999px", background: "#fff", color: "#0a0a0a",
            fontSize: "15px", fontWeight: 500, border: "none", cursor: "pointer",
          }}>
            Send Message
          </button>
        </form>
      )}
    </div>
  );
}
