import Link from 'next/link';

export default function CreatorNotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <p className="rail">404</p>
      <h1 className="mt-3 text-xl font-semibold tracking-tight text-ink">No profile here</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
        This handle doesn&apos;t exist, or the creator hasn&apos;t published their media kit yet.
      </p>
      <Link href="/" className="mt-6 text-[13px] text-indigo underline-offset-4 hover:underline">
        Back to adfit
      </Link>
    </main>
  );
}
