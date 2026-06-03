import { cn } from "@/lib/utils";

interface BrandMarkProps {
  className?: string;
}

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <div
      className={cn(
        "grid place-items-center rounded-[10px] border border-[#fffaf0]/25",
        "[background:linear-gradient(135deg,var(--oa-red),#a93a31)] font-heading text-[21px] font-extrabold text-[#fffaf0] shadow-[0_12px_28px_rgba(217,74,56,0.28)]",
        className
      )}
    >
      编
    </div>
  );
}
