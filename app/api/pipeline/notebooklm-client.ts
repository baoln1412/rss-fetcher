/**
 * NotebookLM MCP client wrapper for the crime news pipeline.
 *
 * Communicates with the NotebookLM MCP server running in HTTP mode
 * at http://127.0.0.1:8321/mcp using the MCP streamable HTTP protocol.
 *
 * The server uses SSE (Server-Sent Events) format for responses — the
 * connection stays open so we must stream-read and extract the first
 * `data:` payload, then abort the connection.
 *
 * Start the server with:
 *   notebooklm-mcp --transport http --port 8321
 */

const MCP_BASE_URL = process.env.NOTEBOOKLM_MCP_URL ?? 'http://127.0.0.1:8321';
const MCP_ENDPOINT = `${MCP_BASE_URL}/mcp`;
const TOOL_TIMEOUT_MS = 120_000; // 2 min for notebook queries
const HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json, text/event-stream',
};

let requestId = 0;
let sessionId: string | null = null;
let initialized = false;

// ── Read first SSE data payload from a streaming response ────────────────

async function readSSEPayload(response: Response, controller: AbortController): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Look for a complete SSE data: line
      const dataMatch = buffer.match(/^data:\s*(.+)$/m);
      if (dataMatch) {
        const jsonStr = dataMatch[1].trim();
        try {
          const parsed = JSON.parse(jsonStr);
          // We got our response — abort the stream
          controller.abort();
          return parsed;
        } catch {
          // Incomplete JSON, keep reading
        }
      }

      // Also try plain JSON (non-SSE response)
      try {
        const parsed = JSON.parse(buffer.trim());
        controller.abort();
        return parsed;
      } catch {
        // Not complete JSON yet
      }
    }
  } catch (err) {
    // AbortError is expected — we abort after getting data
    if (err instanceof Error && err.name === 'AbortError') {
      // Try to parse what we have
      const dataMatch = buffer.match(/^data:\s*(.+)$/m);
      if (dataMatch) {
        return JSON.parse(dataMatch[1].trim());
      }
    }
    throw err;
  } finally {
    reader.releaseLock();
  }

  // If we got here, try parsing the full buffer
  const dataMatch = buffer.match(/^data:\s*(.+)$/m);
  if (dataMatch) {
    return JSON.parse(dataMatch[1].trim());
  }
  throw new Error('No SSE data received');
}

// ── MCP session management ───────────────────────────────────────────────

async function ensureInitialized(): Promise<void> {
  if (initialized && sessionId) return;

  const id = ++requestId;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(MCP_ENDPOINT, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'crime-news-pipeline', version: '1.0' },
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`MCP initialize failed (${res.status}): ${text.slice(0, 200)}`);
    }

    // Extract session ID from response headers
    sessionId = res.headers.get('mcp-session-id');
    console.log(`[notebooklm] MCP session: ${sessionId?.slice(0, 12)}...`);

    // Read the SSE payload (and close the stream)
    await readSSEPayload(res, controller);
  } finally {
    clearTimeout(timer);
  }

  // Send initialized notification (fire-and-forget)
  const notifyController = new AbortController();
  const notifyTimer = setTimeout(() => notifyController.abort(), 5_000);
  try {
    const notifyRes = await fetch(MCP_ENDPOINT, {
      method: 'POST',
      headers: {
        ...HEADERS,
        ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
      signal: notifyController.signal,
    });
    // Notification responses may not have a body, consume anyway
    await notifyRes.text().catch(() => {});
  } catch {
    // Notifications can fail silently
  } finally {
    clearTimeout(notifyTimer);
  }

  initialized = true;
  console.log(`[notebooklm] MCP session initialized`);
}

// ── Core MCP tool call ───────────────────────────────────────────────────

async function mcpCall(toolName: string, args: Record<string, unknown>): Promise<unknown> {
  await ensureInitialized();

  const id = ++requestId;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS);

  try {
    const res = await fetch(MCP_ENDPOINT, {
      method: 'POST',
      headers: {
        ...HEADERS,
        ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: { name: toolName, arguments: args },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`MCP ${toolName} failed (${res.status}): ${text.slice(0, 300)}`);
    }

    const rpc = (await readSSEPayload(res, controller)) as {
      result?: { content?: Array<{ type: string; text: string }> };
      error?: { code: number; message: string };
    };

    if (rpc.error) {
      throw new Error(`MCP ${toolName}: ${rpc.error.message}`);
    }

    // Extract text from result.content array
    if (rpc.result?.content && Array.isArray(rpc.result.content)) {
      const textItem = rpc.result.content.find((c) => c.type === 'text');
      if (textItem?.text) {
        try {
          return JSON.parse(textItem.text);
        } catch {
          return textItem.text;
        }
      }
    }

    return rpc.result;
  } finally {
    clearTimeout(timer);
  }
}

// ── Public API ───────────────────────────────────────────────────────────

export async function isAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${MCP_BASE_URL}/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function createNotebook(title: string): Promise<{ id: string; title: string }> {
  console.log(`[notebooklm] Creating notebook: "${title}"`);
  const result = await mcpCall('notebook_create', { title });

  let id = '';
  if (typeof result === 'object' && result !== null) {
    const obj = result as Record<string, unknown>;
    id = String(obj.notebook_id ?? obj.id ?? '');
    if (!id && Array.isArray(obj.notebooks)) {
      id = String((obj.notebooks[0] as Record<string, unknown>)?.id ?? '');
    }
  }
  if (!id && typeof result === 'string') {
    const match = result.match(/[a-f0-9-]{20,}/);
    id = match ? match[0] : result;
  }

  console.log(`[notebooklm] Notebook created: "${id}"`);
  return { id, title };
}

export async function addUrlSource(notebookId: string, url: string): Promise<void> {
  console.log(`[notebooklm] Adding source: ${url.slice(0, 80)}...`);
  try {
    await mcpCall('notebook_add_url', { notebook_id: notebookId, url });
  } catch (err) {
    console.warn(`[notebooklm] Failed to add URL "${url.slice(0, 60)}":`, err);
  }
}

export async function queryNotebook(notebookId: string, query: string): Promise<string> {
  console.log(`[notebooklm] Querying notebook...`);
  const result = await mcpCall('notebook_query', {
    notebook_id: notebookId,
    query,
  });

  if (typeof result === 'string') return result;
  if (typeof result === 'object' && result !== null) {
    const obj = result as Record<string, unknown>;
    return String(obj.answer ?? obj.response ?? obj.text ?? JSON.stringify(result));
  }
  return String(result);
}

export async function deleteNotebook(notebookId: string): Promise<void> {
  console.log(`[notebooklm] Deleting notebook...`);
  try {
    await mcpCall('notebook_delete', { notebook_id: notebookId, confirm: true });
  } catch (err) {
    console.warn(`[notebooklm] Cleanup failed:`, err);
  }
}

export function resetSession(): void {
  sessionId = null;
  initialized = false;
  requestId = 0;
}
