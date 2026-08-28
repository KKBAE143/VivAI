import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileText, Scale, Building2, Mail, Loader2, AlertTriangle } from "lucide-react";

import { AppShell, Card, PageHeader } from "@/components/app-shell";
import { ErrorState } from "@/components/error-state";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms and Conditions — VivAI" },
      {
        name: "description",
        content:
          "VivAI Terms and Conditions covering the IT Act 2000, Consumer Protection E-Commerce Rules 2020, and DPDP Act 2023.",
      },
    ],
  }),
  component: TermsPage,
});

interface Terms {
  version: string;
  last_updated: string;
  title: string;
  governing_law: string;
  jurisdiction: string;
  entity: { name: string; description: string; contact: string };
  summary: string;
  sections: { heading: string; body: string }[];
}

/**
 * The terms text is fetched from the API — the single source of truth,
 * the same pattern the privacy page uses.
 */
function TermsPage() {
  const { isAuthenticated } = useAuth();

  const {
    data: terms,
    isLoading,
    error,
    refetch,
  } = useQuery<Terms>({
    queryKey: ["terms-and-conditions"],
    queryFn: () => api<Terms>("/api/terms/policy"),
  });

  const body = (
    <>
      <PageHeader
        title="Terms and Conditions"
        subtitle={
          terms
            ? `Version ${terms.version} · Updated ${terms.last_updated}`
            : "Legal terms governing your use of VivAI"
        }
      />

      <div className="mx-auto max-w-3xl space-y-5">
        {isLoading && (
          <Card>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading terms…
            </p>
          </Card>
        )}

        {error && (
          <ErrorState
            message="Could not load the Terms and Conditions. Retry, or write to support@vivai.app if this keeps failing."
            onRetry={() => void refetch()}
          />
        )}

        {terms && (
          <>
            {/* Summary card */}
            <Card className="border-primary/20 bg-primary/5">
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 h-7 w-7 shrink-0 text-primary" />
                <div>
                  <p className="font-semibold text-primary">Please read carefully.</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {terms.summary}
                  </p>
                </div>
              </div>
            </Card>

            {/* Entity identification — Consumer Protection E-Commerce Rules 2020 */}
            <Card>
              <div className="flex items-start gap-3">
                <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <div>
                  <h3 className="font-semibold">About VivAI</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {terms.entity.description}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Contact:{" "}
                    <a
                      href={`mailto:${terms.entity.contact}`}
                      className="text-primary hover:underline"
                    >
                      {terms.entity.contact}
                    </a>
                  </p>
                </div>
              </div>
            </Card>

            {/* Warning: these are legal terms */}
            <Card className="border-warning/30 bg-warning/5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
                <div>
                  <h3 className="font-semibold text-warning">Important</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    These Terms together with the{" "}
                    <Link to="/privacy" className="text-primary hover:underline">
                      Privacy Notice
                    </Link>{" "}
                    form the complete legal agreement between you and VivAI. AI-generated scores and
                    reports are for practice purposes only and are not academic assessments.
                  </p>
                </div>
              </div>
            </Card>

            {/* Main terms sections */}
            {terms.sections.map((section) => (
              <Card key={section.heading}>
                <h3 className="font-semibold">{section.heading}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
                  {section.body}
                </p>
              </Card>
            ))}

            {/* Governing law — IT Act / jurisdiction */}
            <Card>
              <div className="flex items-start gap-3">
                <Scale className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <div>
                  <h3 className="font-semibold">Governing law</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    These Terms are governed by the <strong>{terms.governing_law}</strong>. Disputes
                    are subject to the exclusive jurisdiction of{" "}
                    <strong>{terms.jurisdiction}</strong>.
                  </p>
                </div>
              </div>
            </Card>

            {/* Grievance officer */}
            <Card>
              <div className="flex items-start gap-3">
                <Mail className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <div>
                  <h3 className="font-semibold">Grievance Officer</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    VivAI Grievance Officer
                    <br />
                    <a href="mailto:grievance@vivai.app" className="text-primary hover:underline">
                      grievance@vivai.app
                    </a>
                    <br />
                    We aim to respond within 7 working days, and in any case within the 90 days the
                    DPDP Rules 2025 allow.
                  </p>
                </div>
              </div>
            </Card>

            {/* Link to Privacy Notice */}
            <Card>
              <p className="text-sm text-muted-foreground">
                Also see our{" "}
                <Link to="/privacy" className="text-primary hover:underline font-medium">
                  Privacy Notice
                </Link>{" "}
                — it describes how we collect, process and protect your personal data under the
                Digital Personal Data Protection Act, 2023.
              </p>
            </Card>
          </>
        )}

        <div className="pb-8">
          <Link
            to={isAuthenticated ? "/" : "/signup"}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            {isAuthenticated ? "Back to Dashboard" : "Back to sign up"}
          </Link>
        </div>
      </div>
    </>
  );

  /*
    Readable without signing in — same rationale as the privacy page.
    The signup form links here to explain what the user is consenting to,
    so following that link must not bounce to /login.
  */
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6 lg:p-8">{body}</div>
      </div>
    );
  }
  return <AppShell>{body}</AppShell>;
}
