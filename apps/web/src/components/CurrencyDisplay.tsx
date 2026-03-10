import { useEffect, useRef } from "react";
import { useSpring, useTransform, motion, type MotionValue } from "framer-motion";
import { formatCurrency } from "../utils/format";

type CurrencyDisplayProps = {
  cents: number;
  size?: "sm" | "md" | "lg" | "xl";
  colorCode?: boolean;
  animated?: boolean;
};

const sizeMap = {
  sm: "var(--font-sm)",
  md: "var(--font-base)",
  lg: "var(--font-lg)",
  xl: "var(--font-xl)",
};

function getColor(cents: number): string {
  if (cents > 0) return "var(--danger)";
  if (cents < 0) return "var(--success)";
  return "var(--text-primary)";
}

function AnimatedValue({ value }: { value: MotionValue<string> }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.textContent = value.get();
    }
    const unsubscribe = value.on("change", (v) => {
      if (ref.current) ref.current.textContent = v;
    });
    return unsubscribe;
  }, [value]);

  return <span ref={ref} />;
}

export const CurrencyDisplay = ({ cents, size = "md", colorCode = true, animated = false }: CurrencyDisplayProps) => {
  const spring = useSpring(0, { stiffness: 80, damping: 20 });
  const display = useTransform(spring, (v) => formatCurrency(Math.round(v)));

  useEffect(() => {
    if (animated) spring.set(cents);
  }, [cents, animated, spring]);

  const color = colorCode ? getColor(cents) : "var(--text-primary)";

  return (
    <motion.span
      style={{
        fontSize: sizeMap[size],
        fontWeight: 700,
        color,
        fontVariantNumeric: "tabular-nums",
        letterSpacing: "-0.01em",
      }}
    >
      {animated ? <AnimatedValue value={display} /> : formatCurrency(cents)}
    </motion.span>
  );
};
