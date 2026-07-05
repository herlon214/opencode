import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js"

/**
 * Throttle an accessor to emit at most every `ms` milliseconds, with a trailing
 * flush so the final value always lands. The leading change is emitted
 * immediately so callers see the first update without delay.
 */
export function createDebouncedMemo<T>(source: Accessor<T>, ms: number): Accessor<T> {
  const [get, set] = createSignal(source())
  let last = source()
  let timer: ReturnType<typeof setTimeout> | undefined
  let hasPending = false

  createEffect(() => {
    const next = source()
    if (next === last) return
    last = next

    // Leading edge: emit immediately if we're not currently throttling.
    if (!timer) {
      set(() => next)
      hasPending = false
      timer = setTimeout(() => {
        timer = undefined
        if (hasPending) {
          hasPending = false
          set(() => last)
        }
      }, ms)
      return
    }

    // Mid-throttle: stash the latest value for the trailing flush.
    hasPending = true
  })

  onCleanup(() => {
    if (timer) clearTimeout(timer)
  })

  return get
}