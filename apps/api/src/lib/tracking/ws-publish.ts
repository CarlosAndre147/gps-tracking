let bunServer: unknown = null;

export function setWsServer(server: unknown): void {
  bunServer = server;
}

/**
 * Broadcast to Bun WebSocket topic subscribers (same topic names used in `ws.subscribe`).
 */
export function publishWsTopic(topic: string, payload: unknown): void {
  if (!bunServer) return;
  const message = typeof payload === "string" ? payload : JSON.stringify(payload);
  const publisher = bunServer as { publish: (topic: string, data: string) => number };
  publisher.publish(topic, message);
}
