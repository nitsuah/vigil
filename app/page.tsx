import type { Metadata } from "next";
import HomeDashboard from "./HomeDashboard";

// Home is a client component; keep the product canonical here so /login and
// other routes do not inherit "/".
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function Page() {
  return <HomeDashboard />;
}
