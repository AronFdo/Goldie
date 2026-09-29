interface EdgeRuntimeGlobal {
  waitUntil(promise: Promise<unknown>): void;
}

// Keeps the worker alive for work started after the response is returned.
// Outside the Supabase runtime (tests, plain Deno) the promise just runs.
export function runInBackground(task: Promise<unknown>, label: string): void {
  const guarded = task.catch((error) => {
    console.error(JSON.stringify({
      event: "background_task_failed",
      label,
      error: error instanceof Error ? error.message : String(error),
    }));
  });
  const runtime = (globalThis as { EdgeRuntime?: EdgeRuntimeGlobal }).EdgeRuntime;
  runtime?.waitUntil(guarded);
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
