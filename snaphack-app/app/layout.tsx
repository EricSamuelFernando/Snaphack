import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Snaphack — AI-powered real estate visualization",
  description: "Search real estate listings and reimagine property photos with AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.className} h-full`}>
      <body className="min-h-full bg-white text-gray-900 antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
