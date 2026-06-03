import type { AgentProgressEvent } from "@/lib/scraper/agent/runner";

type ProgressRunner = (send: (event: AgentProgressEvent) => void) => Promise<unknown>;

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive"
} as const;

export function createAgentProgressStream(run: ProgressRunner) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: AgentProgressEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          return;
        }
      };

      try {
        await run(send);
      } catch (error) {
        send({ type: "error", message: error instanceof Error ? error.message : "采集失败" });
      } finally {
        try {
          controller.close();
        } catch {
          return;
        }
      }
    }
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
