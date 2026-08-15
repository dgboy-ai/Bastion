"use client";

interface PipelineParticle {
  id: string;
  stage: number;
  startTime: number;
}

const STAGES = [
  { label: "Agent Write", color: "var(--accent-sunset)" },
  { label: "CDC Changefeed", color: "var(--accent-dusk)" },
  { label: "S3 CDC Tailer", color: "var(--accent-breeze)" },
  { label: "Memory Store", color: "var(--accent-emerald)" },
];

function getStagePosition(stage: number) {
  const clamped = Math.max(0, Math.min(4, stage));
  return { x: 60 + clamped * 155, y: 50 };
}

export default function CdcPipelineSvg({ particles }: { particles: PipelineParticle[] }) {
  return (
    <svg width="100%" height="100" viewBox="0 0 700 100">
      {STAGES.map((stage, i) => (
        <g key={i}>
          <rect
            x={30 + i * 155}
            y="25"
            width="120"
            height="50"
            rx="8"
            fill="rgba(255,255,255,0.02)"
            stroke={stage.color}
            strokeWidth="1"
            opacity="0.6"
          />
          <text
            x={90 + i * 155}
            y="55"
            textAnchor="middle"
            fill={stage.color}
            fontSize="9"
            fontFamily="var(--font-mono)"
          >
            {stage.label}
          </text>
          {i < STAGES.length - 1 && (
            <g>
              <line
                x1={155 + i * 155}
                y1="50"
                x2={180 + i * 155}
                y2="50"
                stroke="rgba(255,255,255,0.15)"
                strokeWidth="1"
                strokeDasharray="4 2"
              />
              <polygon
                points={`${178 + i * 155},46 ${184 + i * 155},50 ${178 + i * 155},54`}
                fill="rgba(255,255,255,0.15)"
              />
            </g>
          )}
        </g>
      ))}
      {particles.map((particle) => {
        const pos = getStagePosition(particle.stage);
        const stageIdx = Math.floor(particle.stage);
        const color = STAGES[Math.min(stageIdx, STAGES.length - 1)].color;
        return (
          <g key={particle.id}>
            <circle cx={pos.x} cy={pos.y} r="4" fill={color} opacity="0.9">
              <animate attributeName="r" values="3;5;3" dur="0.5s" repeatCount="indefinite" />
            </circle>
            <circle cx={pos.x} cy={pos.y} r="8" fill={color} opacity="0.2">
              <animate attributeName="r" values="6;12;6" dur="1s" repeatCount="indefinite" />
            </circle>
          </g>
        );
      })}
    </svg>
  );
}
