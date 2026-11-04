import { describe, expect, it } from "vitest";
import { parseMailSender, shouldUseLocalMailtrap, verificationEmailHtml } from "../src/services/email.service.js";
import { quizResultEmailHtml } from "../src/services/quiz-result-email.service.js";

describe("verification email template", () => {
  it("uses the Mailtrap sandbox only in development", () => {
    expect(shouldUseLocalMailtrap("development")).toBe(true);
    expect(shouldUseLocalMailtrap("production")).toBe(false);
    expect(shouldUseLocalMailtrap("test")).toBe(false);
  });

  it("parses a display name and address for Brevo, or accepts a bare address", () => {
    expect(parseMailSender("LearnGate <no-reply@example.com>")).toEqual({
      name: "LearnGate",
      email: "no-reply@example.com",
    });
    expect(parseMailSender("no-reply@example.com")).toEqual({
      name: "LearnGate",
      email: "no-reply@example.com",
    });
  });

  it("renders a styled action button and a fallback link", () => {
    const html = verificationEmailHtml("Ari", "http://localhost:5173/verify-email?token=secure");
    expect(html).toContain("Verify my email");
    expect(html.match(/href="http:\/\/localhost:5173\/verify-email\?token=secure"/g)).toHaveLength(2);
    expect(html).toContain("expires in <strong");
  });

  describe("quiz result email template", () => {
    it("includes the result details and escapes user-provided content", () => {
      const html = quizResultEmailHtml({
        recipientName: "Faculty",
        studentName: "<Student>",
        subjectName: "Science & Math",
        quizTitle: "Quiz <1>",
        score: 85,
        passed: true,
        correctCount: 17,
        questionCount: 20,
        facultyNotification: true,
      });

      expect(html).toContain("Student &lt;Student&gt;");
      expect(html).toContain("Science &amp; Math");
      expect(html).toContain("Quiz &lt;1&gt;");
      expect(html).toContain("85%");
      expect(html).toContain("Passed");
      expect(html).not.toContain("<Student>");
    });
  });

  it("escapes the greeting and verification URL before inserting them into HTML", () => {
    const html = verificationEmailHtml("<script>alert('hi')</script>", "https://example.test/verify?a=1&b=2");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(&#39;hi&#39;)&lt;/script&gt;");
    expect(html).toContain("a=1&amp;b=2");
  });
});
