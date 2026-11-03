import { describe, expect, it } from "vitest";
import { verificationEmailHtml } from "../src/services/email.service.js";

describe("verification email template", () => {
  it("renders a styled action button and a fallback link", () => {
    const html = verificationEmailHtml("Ari", "http://localhost:5173/verify-email?token=secure");
    expect(html).toContain("Verify my email");
    expect(html.match(/href="http:\/\/localhost:5173\/verify-email\?token=secure"/g)).toHaveLength(2);
    expect(html).toContain("expires in <strong");
  });

  it("escapes the greeting and verification URL before inserting them into HTML", () => {
    const html = verificationEmailHtml("<script>alert('hi')</script>", "https://example.test/verify?a=1&b=2");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(&#39;hi&#39;)&lt;/script&gt;");
    expect(html).toContain("a=1&amp;b=2");
  });
});
