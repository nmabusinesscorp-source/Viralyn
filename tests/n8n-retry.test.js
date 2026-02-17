// Test retry logic in n8n.js by mocking global fetch

const originalFetch = global.fetch;

beforeEach(() => {
  jest.spyOn(console, "warn").mockImplementation();
  jest.spyOn(console, "log").mockImplementation();
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

// We need to re-require after setting env so the module picks up our base URL
function loadN8N() {
  delete require.cache[require.resolve("../lib/n8n")];
  process.env.N8N_WEBHOOK_BASE_URL = "https://test.example.com/webhook";
  return require("../lib/n8n");
}

describe("callWebhook retry logic", () => {
  test("succeeds on first attempt", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: () => Promise.resolve({ success: true }),
    });

    const { callWebhook } = loadN8N();
    const result = await callWebhook("test-path", { data: 1 });

    expect(result).toEqual({ success: true });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("retries on network error and succeeds", async () => {
    global.fetch = jest.fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        json: () => Promise.resolve({ success: true }),
      });

    const { callWebhook } = loadN8N();
    const result = await callWebhook("test-path", {});

    expect(result).toEqual({ success: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test("retries on 500 error and succeeds", async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: () => Promise.resolve("server crash"),
      })
      .mockResolvedValue({
        ok: true,
        headers: { get: () => "application/json" },
        json: () => Promise.resolve({ recovered: true }),
      });

    const { callWebhook } = loadN8N();
    const result = await callWebhook("test-path", {});

    expect(result).toEqual({ recovered: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test("does NOT retry on 400 client error", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: () => Promise.resolve("invalid payload"),
    });

    const { callWebhook } = loadN8N();
    await expect(callWebhook("test-path", {})).rejects.toThrow("400");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("gives up after MAX_RETRIES", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const { callWebhook } = loadN8N();
    await expect(callWebhook("test-path", {})).rejects.toThrow("ECONNREFUSED");
    // 1 initial + 3 retries = 4 total
    expect(global.fetch).toHaveBeenCalledTimes(4);
  }, 20_000);
});
