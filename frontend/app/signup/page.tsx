/* eslint-disable react/jsx-no-bind */
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "../../components/AuthProvider";
import styles from "../auth.module.css";

export default function SignupPage() {
  const router = useRouter();
  const { signup, authError, user, loading } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user && !loading) {
      router.replace("/account");
    }
  }, [user, loading, router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    const confirm = String(form.get("confirm") || "");
    if (!email || !password) {
      setFormError("Email and password are required.");
      return;
    }
    if (password !== confirm) {
      setFormError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await signup(email, password);
      router.replace("/account");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unable to create account.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.brandName}>BuildRootz</span>
          <span className={styles.brandSub}>Homes by LeepUP</span>
        </div>
        <div>
          <h1 className={styles.title}>Create your account</h1>
          <p className={styles.subtitle}>
            Save searches, get updates, and explore new builds faster.
          </p>
        </div>

        {(formError || authError) && (
          <div className={styles.errorBox} role="alert">
            {formError || authError}
          </div>
        )}

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.label} htmlFor="signup-email">
            Email
            <input
              id="signup-email"
              name="email"
              type="email"
              required
              className={styles.input}
              placeholder="you@example.com"
              autoComplete="username"
            />
          </label>

          <div className={styles.stackRow}>
            <label className={styles.label} htmlFor="signup-password">
              Password
            <input
              id="signup-password"
              name="password"
              type="password"
              required
              minLength={8}
              className={styles.input}
              placeholder="Create a password"
              autoComplete="new-password"
            />
          </label>
          <label className={styles.label} htmlFor="signup-confirm">
            Confirm password
            <input
              id="signup-confirm"
              name="confirm"
              type="password"
              required
              minLength={8}
              className={styles.input}
              placeholder="Repeat password"
              autoComplete="new-password"
            />
          </label>
          </div>

          <button type="submit" className={styles.submit} disabled={submitting}>
            {submitting ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className={styles.muted}>
          Already have an account?{" "}
          <Link className={styles.link} href="/login">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
