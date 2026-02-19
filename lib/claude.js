const Anthropic = require("@anthropic-ai/sdk");

const MODEL = "claude-sonnet-4-5-20250929";
const MAX_TOKENS = 4096;

let client;

function getClient() {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

/**
 * Send a message to Claude with optional tool use (e.g. web_search).
 * Returns the full response object from the API.
 */
async function chat({ systemPrompt, messages, tools, maxTokens }) {
  const params = {
    model: MODEL,
    max_tokens: maxTokens || MAX_TOKENS,
    system: systemPrompt,
    messages,
  };

  if (tools && tools.length > 0) {
    params.tools = tools;
  }

  return getClient().messages.create(params);
}

/**
 * Run an agentic loop: send messages, handle tool use responses,
 * and continue until the model produces a final text response.
 * Supports the built-in web_search tool for the Onboarder agent.
 */
async function agentLoop({ systemPrompt, userMessage, tools, maxIterations = 10, maxTokens }) {
  const messages = [{ role: "user", content: userMessage }];
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;

    const response = await chat({
      systemPrompt,
      messages,
      tools,
      maxTokens,
    });

    // Collect all content blocks
    const textBlocks = response.content.filter((b) => b.type === "text");
    const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");

    // If there are no tool calls, we're done — return the final text
    if (toolUseBlocks.length === 0 || response.stop_reason === "end_turn") {
      const finalText = textBlocks.map((b) => b.text).join("\n");
      return { text: finalText, stopReason: response.stop_reason, usage: response.usage };
    }

    // Append assistant response to conversation
    messages.push({ role: "assistant", content: response.content });

    // For server-side tools (web_search is handled by the API itself),
    // we only need to handle custom tools here.
    // The web_search tool results are returned inline by the API,
    // so we check if we need to provide tool results for any custom tools.
    const toolResults = [];
    for (const toolUse of toolUseBlocks) {
      if (toolUse.name === "web_search") {
        // web_search is a built-in server tool — the API handles it.
        // Results come back in the next turn automatically.
        // We don't need to provide a tool_result for server-side tools.
        continue;
      }
      // For any unexpected tool calls, return an error result
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: `Tool "${toolUse.name}" is not available.`,
        is_error: true,
      });
    }

    if (toolResults.length > 0) {
      messages.push({ role: "user", content: toolResults });
    }
  }

  throw new Error(`Agent loop exceeded max iterations (${maxIterations})`);
}

/**
 * Simple single-turn call that returns parsed JSON from the response.
 * Used by the QA agent which doesn't need tools.
 */
async function jsonChat({ systemPrompt, userMessage }) {
  const response = await chat({
    systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  // Extract JSON from the response (may be wrapped in markdown code blocks)
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
  const jsonStr = jsonMatch[1].trim();

  try {
    return { data: JSON.parse(jsonStr), usage: response.usage };
  } catch (err) {
    throw new Error(`Failed to parse JSON from Claude response: ${err.message}\nRaw text: ${jsonStr.slice(0, 200)}`);
  }
}

module.exports = { chat, agentLoop, jsonChat, MODEL };
