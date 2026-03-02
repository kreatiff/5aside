import type { ReactNode } from "react";
import { motion } from "framer-motion";

type StatCardProps = {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  subValue?: string;
  accentColor: string;
  index?: number;
};

export const StatCard = ({ icon, label, value, subValue, accentColor, index = 0 }: StatCardProps) => (
  <motion.div
    className="stat-card"
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: index * 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
  >
    <div
      className="stat-card__icon"
      style={{
        background: `linear-gradient(135deg, ${accentColor}33, ${accentColor}11)`,
        color: accentColor,
        boxShadow: `0 0 24px ${accentColor}22`,
      }}
    >
      {icon}
    </div>
    <div className="stat-card__content">
      <div className="stat-card__label">{label}</div>
      <div className="stat-card__value">{value}</div>
      {subValue && <div className="stat-card__sub">{subValue}</div>}
    </div>
  </motion.div>
);
