import { describe, it, expect } from "vitest";
import { VariableResolver } from "./variables.js";

describe("VariableResolver", () => {
  describe("set/get", () => {
    it("should store and retrieve values", () => {
      const resolver = new VariableResolver();
      resolver.set("name", "Alice");
      expect(resolver.get("name")).toBe("Alice");
    });

    it("should return undefined for unset keys", () => {
      const resolver = new VariableResolver();
      expect(resolver.get("missing")).toBeUndefined();
    });

    it("should set all from object", () => {
      const resolver = new VariableResolver();
      resolver.setAll({ a: 1, b: "two", c: true });
      expect(resolver.get("a")).toBe(1);
      expect(resolver.get("b")).toBe("two");
      expect(resolver.get("c")).toBe(true);
    });
  });

  describe("resolve", () => {
    it("should resolve simple variable", () => {
      const resolver = new VariableResolver();
      resolver.set("name", "World");
      expect(resolver.resolve("Hello ${name}")).toBe("Hello World");
    });

    it("should resolve nested paths", () => {
      const resolver = new VariableResolver();
      resolver.set("user", { name: "Alice", age: 30 });
      expect(resolver.resolve("${user.name} is ${user.age}")).toBe(
        "Alice is 30"
      );
    });

    it("should keep unresolved variables intact", () => {
      const resolver = new VariableResolver();
      expect(resolver.resolve("${missing}")).toBe("${missing}");
    });

    it("should resolve deeply nested paths", () => {
      const resolver = new VariableResolver();
      resolver.set("account", {
        contact: { address: { city: "NYC" } },
      });
      expect(resolver.resolve("${account.contact.address.city}")).toBe("NYC");
    });

    it("should resolve multiple variables in one string", () => {
      const resolver = new VariableResolver();
      resolver.set("first", "John");
      resolver.set("last", "Doe");
      expect(resolver.resolve("${first} ${last}")).toBe("John Doe");
    });

    it("should handle string with no variables", () => {
      const resolver = new VariableResolver();
      expect(resolver.resolve("plain text")).toBe("plain text");
    });

    it("should handle empty string", () => {
      const resolver = new VariableResolver();
      expect(resolver.resolve("")).toBe("");
    });

    it("should handle numeric values", () => {
      const resolver = new VariableResolver();
      resolver.set("count", 42);
      expect(resolver.resolve("Count: ${count}")).toBe("Count: 42");
    });
  });

  describe("resolveObject", () => {
    it("should resolve strings in objects", () => {
      const resolver = new VariableResolver();
      resolver.set("id", "123");
      const result = resolver.resolveObject({
        query: "SELECT * WHERE id = '${id}'",
        label: "Test",
      });
      expect(result.query).toBe("SELECT * WHERE id = '123'");
      expect(result.label).toBe("Test");
    });

    it("should resolve strings in arrays", () => {
      const resolver = new VariableResolver();
      resolver.set("tag", "important");
      const result = resolver.resolveObject(["${tag}", "static"]);
      expect(result).toEqual(["important", "static"]);
    });

    it("should resolve nested objects recursively", () => {
      const resolver = new VariableResolver();
      resolver.set("base", "https://example.com");
      const result = resolver.resolveObject({
        config: { url: "${base}/api", nested: { path: "${base}/v2" } },
      });
      expect(result.config.url).toBe("https://example.com/api");
      expect(result.config.nested.path).toBe("https://example.com/v2");
    });

    it("should pass through non-string primitives", () => {
      const resolver = new VariableResolver();
      expect(resolver.resolveObject(42)).toBe(42);
      expect(resolver.resolveObject(true)).toBe(true);
      expect(resolver.resolveObject(null)).toBe(null);
    });
  });

  describe("toJSON", () => {
    it("should serialize context to plain object", () => {
      const resolver = new VariableResolver();
      resolver.set("a", 1);
      resolver.set("b", "two");
      const json = resolver.toJSON();
      expect(json).toEqual({ a: 1, b: "two" });
    });
  });
});
