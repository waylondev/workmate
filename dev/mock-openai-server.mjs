// 本地 OpenAI 兼容 mock 服务：在没有 OPENAI_API_KEY 时用于端到端联调。
// 用法：node dev/mock-openai-server.mjs [port]
// 后端通过 OPENAI_BASE_URL=http://127.0.0.1:<port>/v1 指向这里即可走完整 SSE 链路。
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? process.env.MOCK_OPENAI_PORT ?? 11434);

const json = (res, code, body) => {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

const sse = (res) => {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
};

const chunk = (delta, finishReason = null) =>
  `data: ${JSON.stringify({
    id: "chatcmpl-mock",
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: "mock-model",
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  })}\n\n`;

let sysLogged = false;

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");

  if (req.method === "GET" && pathname.endsWith("/models")) {
    return json(res, 200, { object: "list", data: [{ id: "mock-model", object: "model" }] });
  }

  if (req.method !== "POST" || !pathname.endsWith("/chat/completions")) {
    return json(res, 404, { error: { message: `not found: ${req.method} ${pathname}` } });
  }

  let body = "";
  for await (const b of req) body += b;
  const payload = JSON.parse(body || "{}");
  if (!sysLogged) {
    sysLogged = true;
    const sys = (payload.messages ?? []).find((m) => m.role === "system");
    const sc = typeof sys?.content === "string" ? sys.content : JSON.stringify(sys?.content ?? "");
    console.log("[mock-openai] systemPrompt.length:", sc.length);
    console.log("[mock-openai] hasPersona(目标即服务):", sc.includes("目标即服务"));
    console.log("[mock-openai] hasMemory(长期记忆):", sc.includes("长期记忆"));
    console.log("[mock-openai] hasKnowledge(领域知识):", sc.includes("领域知识"));
  }
  const lastUser = [...(payload.messages ?? [])]
    .reverse()
    .find((m) => m.role === "user");
  // OpenAI 兼容格式里 content 可能是字符串，也可能是多段数组（[{type:"text",text:...}]）。
  const c = lastUser?.content;
  const question =
    typeof c === "string"
      ? c
      : Array.isArray(c)
        ? c.filter((p) => p.type === "text").map((p) => p.text).join("")
        : "(empty)";

  const answer =
    "这是 Workmate 的 mock 回复（用于无 API Key 的联调验证）。" +
    `你刚才说：「${question.slice(0, 120)}」。` +
    "前后端链路已打通：AG-UI SSE → HarnessAgent → Model。接入真实模型后，此处为模型的流式输出。";

  if (payload.stream) {
    sse(res);
    res.write(chunk({ role: "assistant", content: "" }));
    for (let i = 0; i < answer.length; i += 8) {
      res.write(chunk({ content: answer.slice(i, i + 8) }));
      await new Promise((r) => setTimeout(r, 20)); // 模拟流式输出
    }
    res.write(chunk({}, "stop"));
    res.write("data: [DONE]\n\n");
    return res.end();
  }

  json(res, 200, {
    id: "chatcmpl-mock",
    object: "chat.completion",
    model: "mock-model",
    choices: [{ index: 0, message: { role: "assistant", content: answer }, finish_reason: "stop" }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  });
});

server.listen(port, () => {
  console.log(`[mock-openai] http://127.0.0.1:${port}/v1/chat/completions`);
});
