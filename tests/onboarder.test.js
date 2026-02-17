const { extractJSON, validateOnboardingData, buildSlackNotification } = require("../agents/onboarder");

// ─── extractJSON ────────────────────────────────────────────────

describe("extractJSON", () => {
  test("extracts JSON from markdown code block", () => {
    const text = 'Voici le résultat:\n```json\n{"customer":{"Customer_Name":"Test"},"products":[]}\n```';
    const result = extractJSON(text);
    expect(result.customer.Customer_Name).toBe("Test");
  });

  test("extracts JSON from code block without language tag", () => {
    const text = '```\n{"customer":{"Customer_Name":"Test"},"products":[]}\n```';
    const result = extractJSON(text);
    expect(result.customer.Customer_Name).toBe("Test");
  });

  test("extracts raw JSON without code block", () => {
    const text = '{"customer":{"Customer_Name":"Raw"},"products":[]}';
    const result = extractJSON(text);
    expect(result.customer.Customer_Name).toBe("Raw");
  });

  test("throws on invalid JSON", () => {
    expect(() => extractJSON("```json\n{broken json\n```")).toThrow("Failed to parse");
  });

  test("throws when no JSON found", () => {
    expect(() => extractJSON("No JSON here at all")).toThrow("No valid JSON");
  });
});

// ─── validateOnboardingData ─────────────────────────────────────

describe("validateOnboardingData", () => {
  test("passes with valid data", () => {
    const data = {
      customer: { Customer_Name: "Test", Customer_Market: "Restauration", Mood: "Chaleureux", Visual_type: "Food photography" },
      products: [{ Product_Name: "Burger" }],
    };
    expect(() => validateOnboardingData(data)).not.toThrow();
  });

  test("throws when customer is missing", () => {
    expect(() => validateOnboardingData({ products: [] })).toThrow("Missing 'customer'");
  });

  test("throws when products is missing", () => {
    expect(() => validateOnboardingData({ customer: { Customer_Name: "X" } })).toThrow("Missing or invalid 'products'");
  });

  test("throws when products is not an array", () => {
    expect(() => validateOnboardingData({ customer: { Customer_Name: "X" }, products: "not array" })).toThrow("Missing or invalid 'products'");
  });

  test("warns on missing optional fields but does not throw", () => {
    const spy = jest.spyOn(console, "warn").mockImplementation();
    const data = { customer: {}, products: [] };
    expect(() => validateOnboardingData(data)).not.toThrow();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ─── buildSlackNotification ─────────────────────────────────────

describe("buildSlackNotification", () => {
  test("builds notification with all fields", () => {
    const data = {
      customer: {
        Customer_Name: "Le Burger",
        Customer_ID: "BUR001",
        Customer_Market: "Restauration",
        Customer_Adress: "123 Rue Test",
        Post_Frequency_Weekly: 3,
        Customer_Status: "En review",
        Source_URL: "https://leburger.ch",
      },
      products: [{ Product_Name: "Classic Burger" }, { Product_Name: "Frites" }],
      confidence_scores: { name: 0.95, address: 0.6 },
    };

    const msg = buildSlackNotification(data);
    expect(msg).toContain("Le Burger");
    expect(msg).toContain("BUR001");
    expect(msg).toContain("Restauration");
    expect(msg).toContain("Produits extraits : 2");
    expect(msg).toContain("address: 0.6"); // low confidence warning
  });

  test("handles missing confidence scores", () => {
    const data = {
      customer: { Customer_Name: "X", Customer_Status: "En review" },
      products: [],
    };
    const msg = buildSlackNotification(data);
    expect(msg).toContain("X");
  });
});
