"use client";

import React from "react";
import { SunIcon, MoonIcon } from "@radix-ui/react-icons";
import { IconButton, Tooltip } from "@radix-ui/themes";
import { useTheme } from "./theme-provider";

export function ThemeToggle() {
  const { appearance, toggle } = useTheme();

  return (
    <Tooltip content={appearance === "dark" ? "Switch to light" : "Switch to dark"}>
      <IconButton size="2" variant="soft" color="gray" onClick={toggle} aria-label="Toggle theme">
        {appearance === "dark" ? <SunIcon /> : <MoonIcon />}
      </IconButton>
    </Tooltip>
  );
}

export default ThemeToggle;


