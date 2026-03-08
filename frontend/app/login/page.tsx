/* eslint-disable react/jsx-no-bind */
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "../../components/AuthProvider";
import styles from "../auth.module.css";

export default function LoginPage() {
  const router = useRouter();
  const { login, authError, user, loading } = useAuth();
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
    if (!email || !password) {
      setFormError("Email and password are required.");
      return;
    }
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace("/account");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unable to log in.");
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
          <h1 className={styles.title}>Welcome back</h1>
          <p className={styles.subtitle}>
            Sign in to access your saved homes and alerts.
          </p>
        </div>

        {(formError || authError) && (
          <div className={styles.errorBox} role="alert">
            {formError || authError}
          </div>
        )}

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.label} htmlFor="login-email">
            Email
            <input
              id="login-email"
              name="email"
              type="email"
              required
              className={styles.input}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>

          <label className={styles.label} htmlFor="login-password">
            Password
            <input
              id="login-password"
              name="password"
              type="password"
              required
              className={styles.input}
              placeholder="********"
              autoComplete="current-password"
            />
          </label>

          <div className={styles.actions}>
            <label className={styles.checkbox}>
              <input type="checkbox" name="remember" /> Remember me
            </label>
            <Link className={styles.link} href="#">
              Forgot password?
            </Link>
          </div>

          <button type="submit" className={styles.submit} disabled={submitting}>
            {submitting ? "Signing in..." : "Continue"}
          </button>
        </form>

        <p className={styles.muted}>
          New here?{" "}
          <Link className={styles.link} href="/signup">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
