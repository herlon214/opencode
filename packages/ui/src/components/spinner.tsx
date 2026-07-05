import { ComponentProps, For } from "solid-js"

const outerIndices = new Set([1, 2, 4, 7, 8, 11, 13, 14])
const cornerIndices = new Set([0, 3, 12, 15])
// Stable per-dot phase so the dim field shimmers organically instead of pulsing
// in lockstep by column. Derived from the dot id so it's deterministic across renders.
const phaseDelay = (i: number) => ((i * 137) % 150) / 100 - 0.75
const phaseDuration = (i: number) => 1.5 + ((i * 53) % 90) / 100
const squares = Array.from({ length: 16 }, (_, i) => ({
  id: i,
  x: (i % 4) * 4,
  y: Math.floor(i / 4) * 4,
  delay: (i % 8) * 0.15,
  duration: 1.5,
  outer: outerIndices.has(i),
  corner: cornerIndices.has(i),
  phaseDelay: phaseDelay(i),
  phaseDuration: phaseDuration(i),
}))

export function Spinner(props: {
  class?: string
  classList?: ComponentProps<"div">["classList"]
  style?: ComponentProps<"div">["style"]
}) {
  return (
    <svg
      {...props}
      viewBox="0 0 15 15"
      data-component="spinner"
      classList={{
        ...props.classList,
        [props.class ?? ""]: !!props.class,
      }}
      fill="currentColor"
    >
      <For each={squares}>
        {(square) => (
          <rect
            x={square.x}
            y={square.y}
            width="3"
            height="3"
            rx="1"
            style={{
              opacity: square.corner ? 0 : undefined,
              animation: square.corner
                ? undefined
                : `${square.outer ? "pulse-opacity-dim" : "pulse-opacity"} ${square.phaseDuration}s ease-in-out ${square.phaseDelay}s infinite`,
              "animation-fill-mode": square.corner ? undefined : "both",
            }}
          />
        )}
      </For>
    </svg>
  )
}