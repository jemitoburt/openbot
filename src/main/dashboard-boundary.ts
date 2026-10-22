import { Effect, Result } from "effect";

/** Preserve the public, safe service message at native Promise boundaries. */
export async function runDashboardEffect<A>(operation: Effect.Effect<A, { readonly message: string }>): Promise<A> {
  const result = await Effect.runPromise(Effect.result(operation));
  if (Result.isFailure(result)) throw new Error(result.failure.message);
  return result.success;
}
