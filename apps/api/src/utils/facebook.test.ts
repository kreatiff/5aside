import { describe, expect, it } from "vitest";
import { extractFacebookEventId } from "./facebook.js";

describe("extractFacebookEventId", () => {
  it("extracts ID from standard URL", () => {
    expect(extractFacebookEventId("https://www.facebook.com/events/1234567890")).toBe("1234567890");
  });

  it("extracts ID from URL with trailing slash", () => {
    expect(extractFacebookEventId("https://www.facebook.com/events/1234567890/")).toBe("1234567890");
  });

  it("extracts ID from URL with query params", () => {
    expect(extractFacebookEventId("https://facebook.com/events/123/?active_tab=discussion")).toBe("123");
  });

  it("extracts ID from mobile URL", () => {
    expect(extractFacebookEventId("https://m.facebook.com/events/456789")).toBe("456789");
  });

  it("returns null for non-Facebook URL", () => {
    expect(extractFacebookEventId("https://example.com/events/123")).toBeNull();
  });

  it("returns null for invalid string", () => {
    expect(extractFacebookEventId("not a url")).toBeNull();
  });

  it("returns null for Facebook URL without events path", () => {
    expect(extractFacebookEventId("https://facebook.com/groups/123")).toBeNull();
  });
});
