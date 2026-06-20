export function Logo({ size = 36 }: { size?: number }) {
  return (
    <span
      className="accent-gradient ring-glow inline-flex items-center justify-center rounded-2xl"
      style={{ width: size, height: size }}
    >
      <svg
        width={size * 0.55}
        height={size * 0.55}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
      >
        {/* four-point spark — 'crafted intelligence' */}
        <path
          d="M12 1.5c.4 4.6 2.4 6.6 7 7-4.6.4-6.6 2.4-7 7-.4-4.6-2.4-6.6-7-7 4.6-.4 6.6-2.4 7-7z"
          fill="white"
        />
        <circle cx="19.5" cy="4.5" r="1.6" fill="white" opacity="0.85" />
      </svg>
    </span>
  );
}
