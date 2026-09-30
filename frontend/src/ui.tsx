// Small shared visual pieces: brand mark, icons, spinner, macro bar.
// Icons are inline SVG (lucide-style strokes) so there's no icon dependency.

type IconProps = { className?: string };

function Stroke({ className = "size-4", children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export function LogoMark({ className = "size-7" }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect width="32" height="32" rx="9" className="fill-neutral-900 dark:fill-white" />
      <circle
        cx="16"
        cy="16"
        r="8.5"
        fill="none"
        strokeWidth="2"
        className="stroke-white dark:stroke-neutral-900"
      />
      <circle cx="16" cy="16" r="3.75" className="fill-accent" />
    </svg>
  );
}

export function Brand() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-tight">MacroLens</span>
    </span>
  );
}

export function Backdrop() {
  return <div className="backdrop" aria-hidden="true" />;
}

export function GoogleIcon({ className = "size-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.81z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.9l-3.88-3.02c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.11A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.28a7.2 7.2 0 0 1 0-4.56V6.61H1.28a12 12 0 0 0 0 10.78l4.01-3.11z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.53 11.53 0 0 0 12 0 12 12 0 0 0 1.28 6.61l4.01 3.11C6.23 6.88 8.88 4.77 12 4.77z"
      />
    </svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Stroke>
  );
}

export function CameraIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M14.5 4h-5L7.5 6.5H5A2 2 0 0 0 3 8.5v9A2 2 0 0 0 5 19.5h14a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-2.5z" />
      <circle cx="12" cy="13" r="3.5" />
    </Stroke>
  );
}

export function ImageIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="9" cy="9" r="1.75" />
      <path d="m21 15-4.5-4.5L6 21" />
    </Stroke>
  );
}

export function TextIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M4 7h16M4 12h16M4 17h10" />
    </Stroke>
  );
}

export function MicIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <rect x="9" y="2.5" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" />
    </Stroke>
  );
}

export function LogOutIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </Stroke>
  );
}

export function Spinner({ className = "size-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`animate-spin ${className}`}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

// Share of calories from each macro (4/4/9 kcal per gram), as one thin stacked bar.
export function MacroBar({ protein, carbs, fat }: { protein: number; carbs: number; fat: number }) {
  const p = protein * 4;
  const c = carbs * 4;
  const f = fat * 9;
  const total = p + c + f;
  if (total <= 0) {
    return <div className="h-1.5 rounded-full bg-neutral-200 dark:bg-white/10" />;
  }
  return (
    <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full">
      <div className="bg-protein" style={{ width: `${(p / total) * 100}%` }} />
      <div className="bg-carbs" style={{ width: `${(c / total) * 100}%` }} />
      <div className="bg-fat" style={{ width: `${(f / total) * 100}%` }} />
    </div>
  );
}

export function MacroStat({
  label,
  value,
  unit = "g",
  dot,
}: {
  label: string;
  value: number;
  unit?: string;
  dot?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
        {dot && <span className={`size-1.5 rounded-full ${dot}`} />}
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums tracking-tight">
        {value}
        <span className="ml-0.5 text-sm font-normal text-neutral-400">{unit}</span>
      </div>
    </div>
  );
}
