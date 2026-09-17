export function slotsReply(
  word: string,
  results: readonly string[],
  order: readonly number[] = results.map((_, i) => i),
): Response {
  const body = order.map((slot) => ({ slot, guess: word[slot], result: results[slot] }));
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
