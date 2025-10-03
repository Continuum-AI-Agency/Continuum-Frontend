"use client";

import { PropsWithChildren } from "react";
import { motion, type Variants, type HTMLMotionProps } from "framer-motion";

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: (custom: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut", delay: custom },
  }),
};

export const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

export function MotionBox({ children, ...props }: PropsWithChildren<HTMLMotionProps<"div">>) {
  return (
    <motion.div initial="hidden" animate="visible" variants={stagger} {...props}>
      {children}
    </motion.div>
  );
}
