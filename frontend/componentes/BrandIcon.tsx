type BrandIconProps = {
  size?: number;
  className?: string;
};

export default function BrandIcon({ size = 24, className }: BrandIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="CarCare Tracker"
      className={className}
    >
      <defs>
        <linearGradient id="brand-icon-accent" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7dff7a" />
          <stop offset="55%" stopColor="#3bf63b" />
          <stop offset="100%" stopColor="#16a34a" />
        </linearGradient>
        <radialGradient id="brand-icon-glow" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#3bf63b" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#3bf63b" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="16" fill="#06080d" />
      <rect x="6" y="6" width="52" height="52" rx="14" fill="url(#brand-icon-glow)" />
      <path
        d="M42.5 20.5a15.5 15.5 0 1 0 0 23"
        fill="none"
        stroke="url(#brand-icon-accent)"
        strokeWidth="6.5"
        strokeLinecap="round"
      />
      <path
        d="M40 22.5a13 13 0 1 0 0 19"
        fill="none"
        stroke="#d7ffe0"
        strokeOpacity="0.18"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
