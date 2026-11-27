import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="glass w-full max-w-md space-y-4 rounded-lg p-10 text-center">
        <h1 className="text-2xl font-bold text-slate-100">Page not found</h1>
        <p className="text-slate-400">Vigil has no page at this address.</p>
        <Link href="/" className="inline-block text-indigo-300 underline hover:text-indigo-200">
          Back to the dashboard
        </Link>
      </div>
    </main>
  );
}
