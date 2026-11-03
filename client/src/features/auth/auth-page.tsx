import { useEffect, useState } from "react";
import { ArrowRight, BookOpenCheck, CheckCircle2, MailCheck, ShieldCheck, UserRound } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { useAuth } from "./auth-context";
import { api, getApiError } from "@/services/api";

const registrationSchema = z.object({
  firstName: z.string().trim().min(1, "Enter your first name").max(80),
  lastName: z.string().trim().min(1, "Enter your last name").max(80),
  username: z.string().trim().toLowerCase().min(3).max(32).regex(/^[a-z0-9._-]+$/, "Use letters, numbers, dots, underscores, or hyphens"),
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(12, "Use at least 12 characters").max(128),
  role: z.enum(["student", "faculty"]),
  privacyConsent: z.literal(true, { error: "Consent is required to register" }),
});

type AuthMode = "login" | "register" | "forgot" | "reset" | "verify" | "resend";
type SuccessKind = "verified" | "verification-sent" | "reset-sent" | "password-updated";

export function AuthPage({ mode }: { mode: AuthMode }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [successKind, setSuccessKind] = useState<SuccessKind | null>(null);
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");

  useEffect(() => {
    if (!profilePhoto) {
      setPhotoPreview("");
      return;
    }
    const previewUrl = URL.createObjectURL(profilePhoto);
    setPhotoPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [profilePhoto]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSuccessKind(null);
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      if (mode === "login") {
        const identifier = String(form.get("identifier") ?? "").trim();
        const password = String(form.get("password") ?? "");
        if (!identifier || !password) throw new Error("Enter your username or email and password.");
        await signIn(identifier, password);
        navigate("/");
      } else if (mode === "register") {
        const parsed = registrationSchema.safeParse({
          firstName: form.get("firstName"),
          lastName: form.get("lastName"),
          username: form.get("username"),
          email: form.get("email"),
          password: form.get("password"),
          role: form.get("role"),
          privacyConsent: form.get("privacyConsent") === "on",
        });
        if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check your registration details.");
        const registration = new FormData();
        Object.entries(parsed.data).forEach(([key, value]) => registration.append(key, String(value)));
        const facultyAccessCode = String(form.get("facultyAccessCode") ?? "").trim();
        if (facultyAccessCode) registration.append("facultyAccessCode", facultyAccessCode);
        if (profilePhoto) registration.append("profileImage", profilePhoto);
        const { data } = await api.post("/auth/register", registration, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        setMessage(data.data.message);
        setSuccessKind("verification-sent");
      } else if (mode === "verify") {
        const token = params.get("token");
        if (!token) throw new Error("Verification token is missing.");
        const { data } = await api.post("/auth/verify-email", { token });
        setMessage(data.data.message);
        setSuccessKind("verified");
      } else if (mode === "forgot") {
        const email = String(form.get("email") ?? "").trim();
        if (!z.string().email().safeParse(email).success) throw new Error("Enter a valid email address.");
        const { data } = await api.post("/auth/forgot-password", { email });
        setMessage(data.data.message);
        setSuccessKind("reset-sent");
      } else if (mode === "resend") {
        const email = String(form.get("email") ?? "").trim();
        if (!z.string().email().safeParse(email).success) throw new Error("Enter a valid email address.");
        const { data } = await api.post("/auth/resend-verification", { email });
        setMessage(data.data.message);
        setSuccessKind("verification-sent");
      } else {
        const token = params.get("token");
        const password = String(form.get("password") ?? "");
        if (!token) throw new Error("Password reset token is missing.");
        if (password.length < 12) throw new Error("Use at least 12 characters for your password.");
        const { data } = await api.post("/auth/reset-password", { token, password });
        setMessage(data.data.message);
        setSuccessKind("password-updated");
      }
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setBusy(false);
    }
  }

  const title: Record<AuthMode, string> = {
    login: "Welcome back",
    register: "Create your account",
    forgot: "Reset your password",
    reset: "Choose a new password",
    verify: "Verify your email",
    resend: "Resend verification email",
  };

  return (
    <div className="auth-page">
      <header className="auth-header">
        <Link className="brand" to="/"><span className="brand-mark"><BookOpenCheck size={19} /></span><span>Learn<span className="brand-accent">Gate</span></span></Link>
        <ThemeToggle />
      </header>
      <main className="auth-card">
        <span className="eyebrow">LEARN WITH PURPOSE</span>
        <h1>{title[mode]}</h1>
        {mode === "register" && <p className="auth-subtitle">Create a secure account to access your learning workspace.</p>}
        {error && <div className="form-message form-error" role="alert">{error}</div>}
        {message && successKind && (
          <section aria-live="polite" className="auth-result-card" role="status">
            <span className={`auth-result-icon ${successKind === "verified" ? "verified" : ""}`}>
              {successKind === "verified" || successKind === "password-updated" ? <CheckCircle2 aria-hidden="true" size={25} /> : <MailCheck aria-hidden="true" size={25} />}
            </span>
            <span className="eyebrow">
              {successKind === "verified" ? "EMAIL CONFIRMED"
                : successKind === "verification-sent" ? "CHECK YOUR INBOX"
                  : successKind === "reset-sent" ? "PASSWORD RESET REQUEST"
                    : "ALL SET"}
            </span>
            <h2>
              {successKind === "verified" ? "You’re verified."
                : successKind === "verification-sent" ? "One step closer."
                  : successKind === "reset-sent" ? "Check your inbox."
                    : "Your password is updated."}
            </h2>
            <p>{message}</p>
            <div className="auth-result-actions">
              <Link className="primary-button link-button" to="/login">
                {successKind === "verified" || successKind === "password-updated" ? "Continue to sign in" : "Go to sign in"}
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
              {(successKind === "verification-sent" || successKind === "reset-sent") && (
                <Link className="secondary-button auth-secondary-cta" to={successKind === "verification-sent" ? "/resend-verification" : "/forgot-password"}>
                  {successKind === "verification-sent" ? "Need another email?" : "Request another reset link"}
                </Link>
              )}
            </div>
          </section>
        )}
        {mode === "verify" && error && (
          <div className="auth-expired-actions">
            <p>The link may have expired or already been used. Request a fresh link to continue.</p>
            <Link className="primary-button link-button" to="/resend-verification">Request a new verification email <ArrowRight size={16} /></Link>
            <Link className="auth-tertiary-cta" to="/login">Return to sign in</Link>
          </div>
        )}
        {!message && !(mode === "verify" && error) && (
          <form className="form-stack" onSubmit={handleSubmit}>
            {mode === "login" && <>
              <label>Username or email<input autoComplete="username" name="identifier" required /></label>
              <label>Password<input autoComplete="current-password" name="password" type="password" required /></label>
              <button className="primary-button" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
            </>}
            {mode === "resend" && <>
              <p className="auth-subtitle">If your account needs verification, we’ll send a new link.</p>
              <label>Email<input name="email" type="email" autoComplete="email" required /></label>
              <button className="primary-button" disabled={busy}>{busy ? "Sending…" : "Resend verification email"}</button>
            </>}
            {mode === "register" && <>
              <div className="form-grid">
                <label>First name<input name="firstName" autoComplete="given-name" required /></label>
                <label>Last name<input name="lastName" autoComplete="family-name" required /></label>
              </div>
              <label>Username<input name="username" autoComplete="username" required minLength={3} /></label>
              <label>Email<input name="email" type="email" autoComplete="email" required /></label>
              <label>Password<input name="password" type="password" autoComplete="new-password" required minLength={12} /><span className="field-note">At least 12 characters.</span></label>
              <label>Account type<select name="role" defaultValue="student"><option value="student">Student</option><option value="faculty">Faculty</option></select></label>
              <label>Faculty access code <span className="field-note">Optional. Otherwise, faculty accounts require administrator approval.</span><input name="facultyAccessCode" type="password" autoComplete="off" /></label>
              <div className="registration-photo-field">
                <span className="registration-photo-label">Profile photo <span className="field-note">Optional · JPG, PNG, or WebP · up to 5 MB</span></span>
                <div className="registration-photo-control">
                  <span className="profile-photo profile-photo-preview">
                    {photoPreview ? <img alt="Profile photo preview" src={photoPreview} /> : <UserRound aria-hidden="true" size={22} />}
                  </span>
                  <label className="upload-button">Choose photo
                    <input accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" name="profileImage" onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      if (file && file.size > 5 * 1024 * 1024) {
                        setError("Profile photos must be 5 MB or smaller.");
                        setProfilePhoto(null);
                        event.currentTarget.value = "";
                        return;
                      }
                      setError("");
                      setProfilePhoto(file);
                    }} type="file" />
                  </label>
                  {profilePhoto && <span className="field-note">{profilePhoto.name}</span>}
                </div>
              </div>
              <div className="privacy-notice"><strong>Privacy notice</strong><p>LearnGate collects your name, username, email, optional profile photo, and account data to provide learning, teaching, and account-support features. We use access controls and secure storage to protect this information. For data questions or assistance, contact your LearnGate administrator.</p>
                <label className="checkbox-row"><input name="privacyConsent" type="checkbox" required /> I have read this notice and consent to this data being used for LearnGate.</label>
              </div>
              <button className="primary-button" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>
            </>}
            {mode === "forgot" && <>
              <p className="auth-subtitle">If an account matches the address, we’ll email a reset link.</p>
              <label>Email<input name="email" type="email" autoComplete="email" required /></label>
              <button className="primary-button" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
            </>}
            {mode === "reset" && <>
              <label>New password<input name="password" type="password" autoComplete="new-password" required minLength={12} /></label>
              <button className="primary-button" disabled={busy}>{busy ? "Updating…" : "Update password"}</button>
            </>}
            {mode === "verify" && <>
              <p className="auth-subtitle">Confirm your email address to activate your account.</p>
              <button className="primary-button" disabled={busy}>{busy ? "Verifying…" : <><ShieldCheck aria-hidden="true" size={17} /> Verify email</>}</button>
            </>}
          </form>
        )}
        <div className="auth-links">
          {mode === "login" && <><Link to="/register">Create an account</Link><Link to="/forgot-password">Forgot password?</Link></>}
          {mode === "register" && <Link to="/login">Already have an account? Sign in</Link>}
          {mode === "register" && <Link to="/resend-verification">Resend verification email</Link>}
          {(mode === "forgot" || mode === "reset" || (mode === "verify" && !error)) && <Link to="/login">Return to sign in</Link>}
        </div>
      </main>
    </div>
  );
}
