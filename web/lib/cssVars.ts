import type { CSSProperties } from "react";

/** Permite pasar variables CSS (--x) en style sin pelear con TypeScript. */
export type CSSVars = CSSProperties & Record<`--${string}`, string | number>;
