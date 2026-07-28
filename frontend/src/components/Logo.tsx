import { COLOR_PRIMARY } from "../theme/colorMode";

export interface LogoProps {
  size?: number;
}

/**
 * Eigenes Logo (Etikettenanhaenger). Bewusst nicht Spoolmans Logo —
 * siehe docs/ui-analysis.md, Abschnitt 7 (c).
 */
export function Logo({ size = 28 }: LogoProps): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="64" height="64" rx="14" fill={COLOR_PRIMARY} />
      <path
        d="M30.5 13H45a6 6 0 0 1 6 6v14.5a6 6 0 0 1-1.76 4.24L34.74 52.24a6 6 0 0 1-8.48 0L11.76 37.74a6 6 0 0 1 0-8.48l14.5-14.5A6 6 0 0 1 30.5 13Z"
        fill="#ffffff"
      />
      <circle cx="41" cy="23" r="4.5" fill={COLOR_PRIMARY} />
    </svg>
  );
}
