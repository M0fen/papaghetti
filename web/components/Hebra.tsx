import type { CSSVars } from "@/lib/cssVars";

/**
 * LA HEBRA — el trazo firma. Un solo path continuo que se dibuja solo.
 * pathLength=1 normaliza la longitud → el dibujado funciona sin medir.
 */

export function WordmarkHebra() {
  return (
    <svg
      className="wordmark__hebra"
      viewBox="0 0 620 140"
      fill="none"
      aria-hidden
    >
      <path
        className="hebra-path draw"
        pathLength={1}
        style={{ "--len": 1, "--delay": "1200ms" } as CSSVars}
        stroke="currentColor"
        strokeWidth={11}
        d="M18 78 C 70 22, 150 22, 182 78 S 268 128, 312 74 S 430 20, 476 76 S 566 122, 604 66"
      />
    </svg>
  );
}

export function DividerHebra({
  color,
}: {
  color?: "oro" | "pomodoro";
}) {
  return (
    <svg
      className={`divider ${color === "pomodoro" ? "divider--pomodoro" : ""}`}
      viewBox="0 0 1200 40"
      preserveAspectRatio="none"
      fill="none"
      aria-hidden
    >
      <path
        className="hebra-path hebra-draw-path"
        pathLength={1}
        stroke="currentColor"
        strokeWidth={6}
        d="M0 20 C 100 0, 200 40, 300 20 S 500 0, 600 20 S 800 40, 900 20 S 1100 0, 1200 20"
      />
    </svg>
  );
}

export function FooterSign() {
  return (
    <svg
      className="footer__sign"
      viewBox="0 0 420 80"
      width="100%"
      height="60"
      fill="none"
      aria-hidden
    >
      <path
        className="hebra-path hebra-draw-path"
        pathLength={1}
        stroke="currentColor"
        strokeWidth={5}
        d="M8 45 C 50 8, 110 8, 140 44 S 235 78, 285 42 C 320 16, 360 20, 412 40"
      />
    </svg>
  );
}
