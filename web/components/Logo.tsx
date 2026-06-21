export function Logo({ size = 40 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-lg bg-ink"
      style={{ width: size, height: size }}
    >
      <svg
        width={size * 0.56}
        height={size * 0.56}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
      >
        {/* four-point spark — 'crafted' */}
        <path
          d="M12 1.5c.4 4.6 2.4 6.6 7 7-4.6.4-6.6 2.4-7 7-.4-4.6-2.4-6.6-7-7 4.6-.4 6.6-2.4 7-7z"
          fill="#fffaf0"
        />
        <circle cx="19.5" cy="4.5" r="1.5" fill="#ffb084" />
      </svg>
    </span>
  );
}
