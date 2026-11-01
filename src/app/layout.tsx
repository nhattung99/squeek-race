import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "SqueekRace Arena — Little paws. Big predictions.",
  description:
    "Race, Predict & Play with Squeektoshi's Real-World Wheel Activity. Free arcade play, real hardware measurements, zero wagering.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
