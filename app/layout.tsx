import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { auth } from "@/auth";
import { SessionProvider } from "next-auth/react";

const inter = Inter({ subsets: ["latin"] });

const SITE_URL = "https://gh-vigil.netlify.app";
const SHARE_DESCRIPTION =
  "Every repo graded, every TASKS.md rolled up, and your agents can ask what to work on next.";
// 1200x630 center-crop of the showcase poster (site/assets/poster.jpg).
const SHARE_IMAGE = {
  url: "/og-1200x630.jpg",
  width: 1200,
  height: 630,
  alt: "Vigil: keep watch over all of your GitHub repos",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Vigil — Repo Intelligence",
  description: "Unified health monitoring and intelligence for all your GitHub repositories",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Vigil",
    title: "Vigil — Repo Intelligence",
    description: SHARE_DESCRIPTION,
    images: [SHARE_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "Vigil — Repo Intelligence",
    description: SHARE_DESCRIPTION,
    images: [SHARE_IMAGE],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-slate-950 text-white antialiased`}>
        <SessionProvider session={session}>
          <main className="w-full">{children}</main>
        </SessionProvider>
      </body>
    </html>
  );
}
