import { signIn } from "@/auth";

export default async function LoginPage() {
    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
            <div className="container mx-auto px-4">
                {/* Login Card */}
                <div className="flex justify-center">
                    <div className="glass rounded-lg p-12 max-w-md w-full text-center space-y-6">
                        <div className="flex justify-center">
                            <div className="h-16 w-16 rounded-xl bg-gradient-to-br from-indigo-600/20 to-purple-600/20 border border-indigo-500/30 flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className="h-8 w-8 text-indigo-300" aria-hidden="true">
                                    <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.5"/>
                                    <line x1="12" y1="3.5" x2="12" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                                    <line x1="12" y1="17" x2="12" y2="20.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                                    <line x1="3.5" y1="12" x2="7" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                                    <line x1="17" y1="12" x2="20.5" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                                    <circle cx="12" cy="12" r="2.5" fill="currentColor"/>
                                </svg>
                            </div>
                        </div>

                        <div>
                            <h1 className="text-3xl font-bold mb-1">Vigil</h1>
                            <p className="text-sm text-slate-500 uppercase tracking-widest font-medium mb-3">Repo Intelligence</p>
                            <p className="text-slate-400">
                                Sign in with GitHub to monitor your repositories
                            </p>
                        </div>

                        <form
                            action={async () => {
                                "use server"
                                await signIn("github", { redirectTo: "/" })
                            }}
                        >
                            <button
                                type="submit"
                                className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
                            >
                                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                                </svg>
                                <span className="font-medium">Sign in with GitHub</span>
                            </button>
                        </form>

                        <p className="text-xs text-slate-500">
                            We&apos;ll request access to your repositories to sync metadata and documentation
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
