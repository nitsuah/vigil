import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { auth } from "@/auth";
import { SessionProvider } from "next-auth/react";

const inter = Inter({ subsets: ["latin"] });

const SITE_URL = "https://gh-vigil.netlify.app";
const SHARE_DESCRIPTION =
  "Every repo graded, every TASKS.md rolled up, and your agents can ask what to work on next.";
// Same 1920x1080 poster the GitHub Pages showcase uses for its link previews.
const SHARE_IMAGE = {
  url: "https://nitsuah.github.io/vigil/assets/poster.jpg",
  width: 1920,
  height: 1080,
  alt: "Vigil: keep watch over all of your GitHub repos",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Vigil — Repo Intelligence",
  description: "Unified health monitoring and intelligence for all your GitHub repositories",
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
    images: [SHARE_IMAGE.url],
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
