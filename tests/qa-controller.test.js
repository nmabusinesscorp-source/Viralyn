const { validateQAResponse, buildSlackNotification } = require("../agents/qa-controller");

// ─── validateQAResponse ─────────────────────────────────────────

describe("validateQAResponse", () => {
  const validData = () => ({
    post_id: "POST001",
    verdict: "PASS",
    score: 8.2,
    new_status: "Prêt à publier",
    feedback: "Bon post",
    suggestions: [],
  });

  test("passes with valid PASS response", () => {
    const data = validData();
    expect(() => validateQAResponse(data, "POST001")).not.toThrow();
  });

  test("passes with valid FAIL response", () => {
    const data = { ...validData(), verdict: "FAIL", score: 3.5, new_status: "Edité" };
    expect(() => validateQAResponse(data, "POST001")).not.toThrow();
  });

  test("maps legacy À revoir status to Edité", () => {
    const data = { ...validData(), verdict: "FAIL", score: 3.5, new_status: "À revoir" };
    validateQAResponse(data, "POST001");
    expect(data.new_status).toBe("Edité");
  });

  test("passes with valid WARN response", () => {
    const data = { ...validData(), verdict: "WARN", score: 6.0 };
    expect(() => validateQAResponse(data, "POST001")).not.toThrow();
  });

  test("sets post_id from argument if missing", () => {
    const data = validData();
    delete data.post_id;
    validateQAResponse(data, "FALLBACK_ID");
    expect(data.post_id).toBe("FALLBACK_ID");
  });

  test("throws on invalid verdict", () => {
    const data = { ...validData(), verdict: "MAYBE" };
    expect(() => validateQAResponse(data, "POST001")).toThrow("Invalid verdict");
  });

  test("throws on score out of range (negative)", () => {
    const data = { ...validData(), score: -1 };
    expect(() => validateQAResponse(data, "POST001")).toThrow("Invalid score");
  });

  test("throws on score out of range (> 10)", () => {
    const data = { ...validData(), score: 11 };
    expect(() => validateQAResponse(data, "POST001")).toThrow("Invalid score");
  });

  test("throws on non-numeric score", () => {
    const data = { ...validData(), score: "high" };
    expect(() => validateQAResponse(data, "POST001")).toThrow("Invalid score");
  });

  test("throws on invalid new_status", () => {
    const data = { ...validData(), new_status: "Publié" };
    expect(() => validateQAResponse(data, "POST001")).toThrow("Invalid new_status");
  });

  test("warns on score/verdict mismatch (high score but not PASS)", () => {
    const spy = jest.spyOn(console, "warn").mockImplementation();
    const data = { ...validData(), verdict: "WARN", score: 8.5 };
    validateQAResponse(data, "POST001");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("mismatch"));
    spy.mockRestore();
  });

  test("warns on score/verdict mismatch (low score but not FAIL)", () => {
    const spy = jest.spyOn(console, "warn").mockImplementation();
    const data = { ...validData(), verdict: "WARN", score: 3.0, new_status: "Edité" };
    validateQAResponse(data, "POST001");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("mismatch"));
    spy.mockRestore();
  });
});

// ─── buildSlackNotification ─────────────────────────────────────

describe("buildSlackNotification", () => {
  test("FAIL notification includes X emoji and alternative post", () => {
    const data = {
      post_id: "POST001",
      verdict: "FAIL",
      score: 3.5,
      feedback: "Produit non mentionné",
      suggestions: ["Ajouter le nom du produit", "Inclure le CTA"],
      alternative_post: "Venez découvrir notre Classic Burger !",
    };
    const customer = { Customer_Name: "Le Burger" };

    const msg = buildSlackNotification(data, customer);
    expect(msg).toContain(":x:");
    expect(msg).toContain("FAIL");
    expect(msg).toContain("3.5/10");
    expect(msg).toContain("Le Burger");
    expect(msg).toContain("Ajouter le nom du produit");
    expect(msg).toContain("Classic Burger");
  });

  test("WARN notification includes warning emoji", () => {
    const data = {
      post_id: "POST002",
      verdict: "WARN",
      score: 6.0,
      feedback: "CTA manquant",
      suggestions: ["Ajouter un CTA"],
    };

    const msg = buildSlackNotification(data, {});
    expect(msg).toContain(":warning:");
    expect(msg).toContain("WARN");
  });

  test("handles missing suggestions gracefully", () => {
    const data = { post_id: "P", verdict: "WARN", score: 6, feedback: "OK" };
    const msg = buildSlackNotification(data, {});
    expect(msg).not.toContain("Suggestions");
  });
});
