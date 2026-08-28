import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, ShieldAlert, Loader2, CheckCircle2 } from "lucide-react";

import { Card } from "@/components/app-shell";
import { api } from "@/lib/api";

/**
 * Parent/guardian verification page.
 *
 * This is a PUBLIC page — the parent is not a VivAI user and must not be
 * asked to log in.  They arrive via a unique, time-limited link emailed to
 * them when their child signed up as under 18.
 *
 * DPDP Rules 2025, Rule 10: the Data Fiduciary must obtain "verifiable consent"
 * from the parent.  Email-link verification (the "email-plus" method) is the
 * recommended practical approach for EdTech platforms.
 */
export const Route = createFileRoute("/verify-parental")({
  head: () => ({
    meta: [
      { title: "Verify Parental Consent — VivAI" },
      {
        name: "description",
        content: "Verify your parental consent for your child's VivAI account.",
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    token: (search.token as string) || "",
  }),
  component: VerifyParentalPage,
});

interface VerifyResult {
  ok: boolean;
  message: string;
  already_verified?: boolean;
}

function VerifyParentalPage() {
  const { token } = useSearch({ from: "/verify-parental" });

  const { data, isLoading, error } = useQuery<VerifyResult>({
    queryKey: ["verify-parental", token],
    queryFn: () => api<VerifyResult>(`/api/privacy/verify-parental?token=${encodeURIComponent(token)}`),
    enabled: !!token,
    retry: false,
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-lg space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="text-center pt-8">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Parental Consent Verification
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            VivAI — AI-powered student companion
          </p>
        </div>

        <Card className="space-y-4">
          {isLoading && (
            <div className="flex items-center gap-3 py-4">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Verifying your consent…</p>
            </div>
          )}

          {error && (
            <div className="space-y-3 py-4">
              <div className="flex items-center gap-3">
                <ShieldAlert className="h-6 w-6 text-destructive" />
                <h2 className="font-semibold text-foreground">Verification failed</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                {error instanceof Error
                  ? error.message
                  : "This verification link is invalid or has expired."}
              </p>
              <p className="text-xs text-muted-foreground">
                If this link has expired, please ask your child to request a new one from their
                VivAI account settings. Verification links are valid for 48 hours.
              </p>
            </div>
          )}

          {data?.already_verified && (
            <div className="space-y-3 py-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-success" />
                <h2 className="font-semibold text-foreground">Already verified</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                You have already verified consent for this account. No further action is needed.
              </p>
            </div>
          )}

          {data?.ok && !data.already_verified && (
            <div className="space-y-3 py-4">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-6 w-6 text-success" />
                <h2 className="font-semibold text-foreground">Consent verified</h2>
              </div>
              <p className="text-sm text-muted-foreground">{data.message}</p>
              <p className="text-xs text-muted-foreground">
                Your child can now use VivAI&apos;s practice sessions (mock viva, presentation coaching,
                pitch drill, and communication coaching). You can withdraw this consent at any time
                by contacting grievance@vivai.app.
              </p>
            </div>
          )}

          {!token && (
            <div className="space-y-3 py-4">
              <div className="flex items-center gap-3">
                <ShieldAlert className="h-6 w-6 text-warning" />
                <h2 className="font-semibold text-foreground">Missing verification link</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                No verification token was provided. Please use the link sent to your email.
              </p>
            </div>
          )}
        </Card>

        <div className="text-center pb-8">
          <Link
            to="/privacy"
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            Read VivAI&apos;s Privacy Notice
          </Link>
        </div>
      </div>
    </div>
  );
}
