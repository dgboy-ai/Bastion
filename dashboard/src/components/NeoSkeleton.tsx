export default function NeoSkeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`shimmer-pulse ${className || ""}`}
      style={{
        background: "#f3f4f6", // light gray, but bold
        border: "3px solid #000000",
        boxShadow: "4px 4px 0px #000000",
        borderRadius: "8px",
        position: "relative",
        overflow: "hidden",
        ...style,
      }}
    >
      <div 
        style={{
          position: "absolute",
          top: 0, left: "-100%", width: "50%", height: "100%",
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)",
          animation: "shimmerWave 1.5s infinite",
        }}
      />
      <style>{`
        @keyframes shimmerWave {
          100% { left: 200%; }
        }
      `}</style>
    </div>
  );
}
