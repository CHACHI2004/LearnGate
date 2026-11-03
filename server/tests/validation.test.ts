import { describe, expect, it } from "vitest";
import { QuestionModel } from "../src/models/question.model.js";
import { UserModel } from "../src/models/user.model.js";
import { registerSchema } from "../src/validators/auth.validators.js";

const validRegistration = {
  firstName: "Riley",
  lastName: "Learner",
  username: "riley.learner",
  email: "riley@example.com",
  password: "A-very-long-password-123",
  role: "student",
  privacyConsent: true,
};

describe("registration validation", () => {
  it("accepts a valid student account and normalizes identity fields", () => {
    const parsed = registerSchema.parse({ ...validRegistration, username: "Riley.Learner", email: "RILEY@EXAMPLE.COM" });
    expect(parsed.username).toBe("riley.learner");
    expect(parsed.email).toBe("riley@example.com");
  });

  it("requires explicit consent and rejects privileged or unexpected fields", () => {
    expect(registerSchema.safeParse({ ...validRegistration, privacyConsent: false }).success).toBe(false);
    expect(registerSchema.safeParse({ ...validRegistration, role: "admin" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...validRegistration, isAdmin: true }).success).toBe(false);
  });
});

describe("protected model fields", () => {
  it("does not select stored password hashes by default", () => {
    expect(UserModel.schema.path("passwordHash").options.select).toBe(false);
  });

  it("keeps answer keys unselected and restricts an MCQ answer to a real choice", async () => {
    expect(QuestionModel.schema.path("correctAnswer").options.select).toBe(false);
    const question = new QuestionModel({
      quizId: "65f000000000000000000001",
      type: "mcq",
      questionText: "Choose the valid option",
      choices: [{ id: "a", text: "Alpha" }, { id: "b", text: "Beta" }],
      correctAnswer: "missing",
      points: 1,
    });
    await expect(question.validate()).rejects.toThrow();
  });
});
