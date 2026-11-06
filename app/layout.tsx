import type { Metadata } from "next";

import { themeInitScript } from "@/components/theme-toggle";

import "./globals.css";

export const metadata: Metadata = {
  title: "Cr8las Recruitment",
  description: "Kandidaten vinden, beoordelen en benaderen — met menselijke goedkeuring.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="nl" suppressHydrationWarning className="h-full antialiased">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="app-background min-h-full">{children}</body>
    </html>
  );
}
