export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 256 256" width={size} height={size} aria-hidden="true">
      {/* Solid square with a mail-slot cutout — monochrome, follows text color. */}
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M36 36 H220 V220 H36 Z M72 84 H184 V112 H72 Z"
      />
    </svg>
  );
}
