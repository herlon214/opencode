import { For, splitProps, type ComponentProps } from "solid-js"
import "./session-progress-indicator-v2.css"

const grid = 5
const dot = 2
const gap = 1
const origin = 1.5
const stepMs = 150

function waveDelay(index: number) {
  const x = index % grid
  const y = Math.floor(index / grid)
  const distance = Math.abs(x - 2) + Math.abs(y - 2)
  return -distance * stepMs
}

const waveDuration = (i: number) => 2400 + ((i * 53) % 960)

const dots = Array.from({ length: grid * grid }, (_, index) => ({
  index,
  x: origin + (index % grid) * (dot + gap),
  y: origin + Math.floor(index / grid) * (dot + gap),
  delay: waveDelay(index),
  duration: waveDuration(index),
}))

export function SessionProgressIndicatorV2(props: ComponentProps<"svg"> & { speed?: number }) {
  const [local, rest] = splitProps(props, ["class", "classList", "width", "height", "speed"])
  const multiplier = () => {
    const rate = local.speed ?? 0
    if (rate <= 0) return 1
    return Math.max(0.4, 1 - (rate - 20) / 200)
  }
  return (
    <svg
      {...rest}
      class={local.class}
      classList={local.classList}
      width={local.width ?? 16}
      height={local.height ?? 16}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      data-component="session-progress-indicator-v2"
      aria-hidden={rest["aria-hidden"] ?? "true"}
    >
      <For each={dots}>
        {(cell) => (
          <rect
            data-dot={cell.index}
            x={cell.x}
            y={cell.y}
            width={dot}
            height={dot}
            rx={1}
            ry={1}
            style={{
              "--_delay": `${cell.delay * multiplier()}ms`,
              "--_duration": `${cell.duration * multiplier()}ms`,
            }}
          />
        )}
      </For>
    </svg>
  )
}