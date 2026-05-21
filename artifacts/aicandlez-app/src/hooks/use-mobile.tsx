import * as React from "react"

const MOBILE_BREAKPOINT = 768

// SSR-safe synchronous initial value. Returning the wrong value on first
// render causes /portal to flash the desktop terminal on mobile devices
// before the effect flips it to <Home />, which both flickers visibly and
// triggers all the heavy desktop queries unnecessarily.
function readIsMobile(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(readIsMobile)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => setIsMobile(mql.matches)
    mql.addEventListener("change", onChange)
    // Re-sync in case the value changed between SSR and hydration.
    setIsMobile(mql.matches)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isMobile
}
