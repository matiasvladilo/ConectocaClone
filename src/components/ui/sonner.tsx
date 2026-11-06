"use client";

import { useTheme } from "next-themes@0.4.6";
import { Toaster as Sonner, ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-center"
      visibleToasts={3}
      duration={3000}
      // En pantallas angostas (la app nativa) sonner usa `mobileOffset`, no
      // `offset`; sin esto el toast caía sobre el notch. El top suma el
      // safe-area-inset-top para despejar la barra de estado del iPhone.
      offset={{ top: 'calc(env(safe-area-inset-top) + 16px)' }}
      mobileOffset={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
