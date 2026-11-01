"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input, Label, FormBanner } from "@/components/ui/field";
import { Card, CardContent } from "@/components/ui/card";

type Step = "password" | "challenge";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/admin";
  const supabase = createClient();

  const [step, setStep] = useState<Step>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Optional MFA challenge state
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);

  async function finish() {
    router.replace(next);
    router.refresh();
  }

  async function afterPassword() {
    // Does the account need / already have a second factor?
    const { data: aal } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const totp = factors?.totp?.find((f) => f.status === "verified");

    // Determine whether MFA is mandatory (admins) from app_users.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: appUser, error: roleErr } = await supabase
      .from("app_users")
      .select("role, status")
      .eq("id", user?.id ?? "")
      .maybeSingle();

    // Signed in, but there is no active app_users row for this auth user.
    // Without it every /admin page bounces back here — surface it clearly
    // instead of looping.
    if (roleErr) {
      await supabase.auth.signOut();
      return setError(`Не удалось прочитать роль: ${roleErr.message}`);
    }
    if (!appUser) {
      await supabase.auth.signOut();
      return setError(
        "Вход выполнен, но учётная запись не привязана к роли. Проверьте, что в таблице app_users есть строка с id, РАВНЫМ id пользователя из Authentication → Users (это разные значения, чем email).",
      );
    }
    if (appUser.status !== "active") {
      await supabase.auth.signOut();
      return setError("Учётная запись отключена. Обратитесь к администратору.");
    }

    if (aal?.currentLevel === "aal2") return finish();

    if (totp) {
      // The user has set up a second factor (optional) → ask for the code.
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({
        factorId: totp.id,
      });
      if (chErr) return setError(chErr.message);
      setFactorId(totp.id);
      setChallengeId(ch.id);
      setStep("challenge");
      return;
    }

    // No second factor — proceed. MFA is not mandatory.
    return finish();
  }

  async function onPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: signErr } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signErr) {
      setLoading(false);
      const m = signErr.message || "";
      if (/email not confirmed/i.test(m)) {
        return setError(
          "Email не подтверждён. В Supabase → Authentication → Users откройте пользователя и нажмите «Confirm email» (или создавайте с Auto Confirm).",
        );
      }
      if (/invalid login credentials/i.test(m)) {
        return setError("Неверный email или пароль.");
      }
      return setError(`Ошибка входа: ${m}`);
    }
    try {
      await afterPassword();
    } catch (err) {
      setError(
        `Непредвиденная ошибка после входа: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    setLoading(false);
  }

  async function onChallengeVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId || !challengeId) return;
    setError(null);
    setLoading(true);
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId,
      code,
    });
    setLoading(false);
    if (vErr) return setError("Неверный код. Попробуйте ещё раз.");
    await finish();
  }

  return (
    <Card className="mx-auto mt-10 max-w-sm">
      <CardContent className="space-y-4 p-6">
        <div className="space-y-1 text-center">
          <h1 className="text-lg font-bold">Вход в панель управления</h1>
          <p className="text-xs text-muted">
            REFAL Basketball League · только для организаторов и операторов
          </p>
        </div>

        {error && <FormBanner kind="error">{error}</FormBanner>}

        {step === "password" && (
          <form onSubmit={onPasswordSubmit} className="space-y-3">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="password">Пароль</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Вход…" : "Войти"}
            </Button>
          </form>
        )}

        {step === "challenge" && (
          <form onSubmit={onChallengeVerify} className="space-y-3">
            <FormBanner kind="info">
              Введите 6-значный код из приложения-аутентификатора.
            </FormBanner>
            <div>
              <Label htmlFor="code">Код</Label>
              <Input
                id="code"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Проверка…" : "Войти"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
