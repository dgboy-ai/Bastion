"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("[ErrorBoundary]", error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="panel" style={{ padding: "24px", textAlign: "center" }}>
          <div style={{ fontSize: "24px", marginBottom: "12px" }}>⚠</div>
          <h2 style={{ marginBottom: "8px", color: "var(--accent-sunset)" }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: "12px", color: "var(--mute)", fontFamily: "var(--font-mono)", marginBottom: "16px" }}>
            {this.state.error?.message || "Unknown error"}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: "8px 20px",
              borderRadius: "6px",
              border: "1px solid var(--glass-border)",
              background: "rgba(255,255,255,0.05)",
              color: "var(--ink)",
              cursor: "pointer",
              fontSize: "12px",
            }}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
