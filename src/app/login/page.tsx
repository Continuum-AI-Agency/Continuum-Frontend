"use client";

import { login, signup, loginWithGoogle } from "@/app/login/actions";

export default function LoginPage() {
  return (
    <form className="max-w-sm mx-auto space-y-4 py-10">
      <div className="space-y-2">
        <label htmlFor="email" className="block text-sm font-medium">Email</label>
        <input id="email" name="email" type="email" required className="w-full rounded border px-3 py-2 bg-transparent" />
      </div>
      <div className="space-y-2">
        <label htmlFor="password" className="block text-sm font-medium">Password</label>
        <input id="password" name="password" type="password" required className="w-full rounded border px-3 py-2 bg-transparent" />
      </div>
      <div className="flex gap-2">
        <button formAction={login} className="px-3 py-2 rounded border">Log in</button>
        <button formAction={signup} className="px-3 py-2 rounded border">Sign up</button>
      </div>
      <div className="pt-2">
        <button formAction={loginWithGoogle} className="px-3 py-2 rounded border w-full">Continue with Google</button>
      </div>
    </form>
  );
}


