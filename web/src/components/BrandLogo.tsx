import Image from "next/image";

type Props = {
  size?: number;
  showWordmark?: boolean;
  className?: string;
};

export function BrandLogo({ size = 36, showWordmark = true, className = "" }: Props) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Image
        src="/s-link-logo.png"
        alt="S-Link"
        width={size}
        height={size}
        className="rounded-xl object-cover shadow-sm"
        priority
      />
      {showWordmark && (
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--brand)]">
          S-Link
        </span>
      )}
    </div>
  );
}
