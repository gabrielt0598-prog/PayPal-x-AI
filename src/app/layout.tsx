import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { AppProviders } from "@/components/state/AppProviders";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Stella",
  description: "Stella: AI personal finance for your PayPal balance and Debit Card.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="h-full bg-bg text-text">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
