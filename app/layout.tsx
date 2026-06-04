import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Eidos",
  description: "Eidos portal",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/eidos-icon.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/eidos-icon.png", type: "image/png", sizes: "512x512" }],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
