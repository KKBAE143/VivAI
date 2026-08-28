import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold backdrop-blur-md transition-all select-none focus:outline-none focus:ring-2 focus:ring-[#AFDDFF]",
  {
    variants: {
      variant: {
        default:
          "border-[#AFDDFF]/30 bg-[#AFDDFF]/15 text-[#AFDDFF] shadow-[0_0_12px_rgba(175,221,255,0.15)]",
        secondary: "border-white/15 bg-white/5 text-white/80 hover:bg-white/10",
        destructive:
          "border-[#FF453A]/30 bg-[#FF453A]/15 text-[#FF453A] shadow-[0_0_12px_rgba(255,69,58,0.2)]",
        success:
          "border-[#7CE4BA]/30 bg-[#7CE4BA]/15 text-[#7CE4BA] shadow-[0_0_12px_rgba(124,228,186,0.2)]",
        outline: "border-white/20 bg-black/40 text-white/90",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
