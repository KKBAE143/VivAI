import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Shield, Trash2, Mail, Loader2, ListTree, Gavel } from "lucide-react";
import { useState } from "react";

import { AppShell, Card, PageHeader } from "@/components/app-shell";
import { ErrorState } from "@/components/error-state";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Notice — VivAI" },
      {
        name: "description",
        content:
          "VivAI privacy notice under the DPDP Act 2023 and DPDP Rules 2025. We never train on your code.",
      },
    ],
  }),
  component: PrivacyPage,
});

interface PolicyItem {
  data: string;
  purpose: string;
  enables: string;
}

interface Policy {
  version: string;
  last_updated: string;
  title: string;
  law: string;
  summary: string;
  items: PolicyItem[];
  sections: { heading: string; body: string }[];
  grievance_officer: {
    name: string;
    email: string;
    response_time: string;
    escalation?: string;
  };
}

/**
 * The notice is fetched, never hardcoded.
 *
 * This page used to keep its own copy of the policy text in a const, so the
 * notice a student read and the notice the API served were free to drift — and
 * only the API's version is the one their recorded consent is versioned against.
 * That makes a divergence a compliance problem, not a copy problem.
 */
function PrivacyPage() {
  const { isAuthenticated } = useAuth();
  const [deleteStatus, setDeleteStatus] = useState<
    "idle" | "confirming" | "deleting" | "done" | "error"
  >("idle");

  const {
    data: policy,
    isLoading,
    error,
    refetch,
  } = useQuery<Policy>({
    queryKey: ["privacy-policy"],
    queryFn: () => api<Policy>("/api/privacy/policy"),
  });

  const handleDelete = async () => {
    if (deleteStatus === "idle") {
      setDeleteStatus("confirming");
      return;
    }
    if (deleteStatus === "confirming") {
      setDeleteStatus("deleting");
      try {
        await api("/api/privacy/delete-my-data", { method: "POST" });
        setDeleteStatus("done");
      } catch {
        setDeleteStatus("error");
      }
    }
  };

  const body = (
    <>
      <PageHeader
        title="Privacy Notice"
        subtitle={
          policy
            ? `${policy.law} · Updated ${policy.last_updated} · Version ${policy.version}`
            : "Digital Personal Data Protection Act 2023 (India)"
        }
      />

      <div className="mx-auto max-w-3xl space-y-5">
        {isLoading && (
          <Card>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading the current notice…
            </p>
          </Card>
        )}

        {error && (
          <ErrorState
            message="Could not load the privacy notice. It is served by the backend so there is only ever one version of it — retry, or write to grievance@vivai.app if this keeps failing."
            onRetry={() => void refetch()}
          />
        )}

        {policy && (
          <>
            <Card className="border-primary/20 bg-primary/5">
              <div className="flex items-start gap-3">
                <Shield className="mt-0.5 h-7 w-7 shrink-0 text-primary" />
                <div>
                  <p className="font-semibold text-primary">We never train on your work.</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {policy.summary}
                  </p>
                </div>
              </div>
            </Card>

            {/*
              Rule 3 of the DPDP Rules 2025 requires the notice to itemise the data
              against the specific purpose for each item and the service it enables.
              A table is the honest shape for that; prose lets items hide.
            */}
            <Card>
              <div className="flex items-start gap-3">
                <ListTree className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold">What we collect, and why</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Every item, its purpose, and the feature it makes possible.
                  </p>
                  <div className="mt-4 space-y-4">
                    {policy.items.map((item) => (
                      <div
                        key={item.data}
                        className="border-l-2 border-border pl-3 text-sm sm:grid sm:grid-cols-3 sm:gap-4 sm:border-l-0 sm:pl-0"
                      >
                        <p className="font-medium">{item.data}</p>
                        <p className="mt-1 text-muted-foreground sm:mt-0">{item.purpose}</p>
                        <p className="mt-1 text-muted-foreground sm:mt-0">{item.enables}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {policy.sections.map((section) => (
              <Card key={section.heading}>
                <h3 className="font-semibold">{section.heading}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {section.body}
                </p>
              </Card>
            ))}

            <Card>
              <div className="flex items-start gap-3">
                <Mail className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <div>
                  <h3 className="font-semibold">Grievance Officer</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {policy.grievance_officer.name}
                    <br />
                    <a
                      href={`mailto:${policy.grievance_officer.email}`}
                      className="text-primary hover:underline"
                    >
                      {policy.grievance_officer.email}
                    </a>
                    <br />
                    {policy.grievance_officer.response_time}
                  </p>
                </div>
              </div>
            </Card>

            {policy.grievance_officer.escalation && (
              <Card>
                <div className="flex items-start gap-3">
                  <Gavel className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                  <div>
                    <h3 className="font-semibold">Escalating a complaint</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {policy.grievance_officer.escalation}
                    </p>
                  </div>
                </div>
              </Card>
            )}
          </>
        )}

        {/* Withdrawing consent and erasure are the same control, by design. */}
        {isAuthenticated && (
          <Card className="border-destructive/20">
            <div className="flex items-start gap-3">
              <Trash2 className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div className="flex-1">
                <h3 className="font-semibold text-destructive">
                  Withdraw consent and delete my data
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Permanently erases your sessions, transcripts, uploads and scores, and withdraws
                  the consent they were based on. This cannot be undone.
                </p>
                <div className="mt-3">
                  {deleteStatus === "idle" && (
                    <button
                      onClick={() => void handleDelete()}
                      className="rounded-xl bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground"
                    >
                      Delete All My Data
                    </button>
                  )}
                  {deleteStatus === "confirming" && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-destructive">
                        Are you absolutely sure? All data will be permanently erased.
                      </p>
                      <div className="flex gap-3">
                        <button
                          onClick={() => void handleDelete()}
                          className="rounded-xl bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground"
                        >
                          Yes, Delete Everything
                        </button>
                        <button
                          onClick={() => setDeleteStatus("idle")}
                          className="rounded-xl bg-secondary px-4 py-2 text-sm font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  {deleteStatus === "deleting" && (
                    <p className="text-sm text-muted-foreground">Deleting your data…</p>
                  )}
                  {deleteStatus === "done" && (
                    <p className="text-sm font-medium text-success">
                      Your data has been deleted. Your account has been anonymized.
                    </p>
                  )}
                  {deleteStatus === "error" && (
                    <div className="space-y-2">
                      <p className="text-sm text-destructive">
                        Deletion failed. Please contact grievance@vivai.app
                      </p>
                      <button
                        onClick={() => setDeleteStatus("idle")}
                        className="rounded-xl bg-secondary px-4 py-2 text-sm font-medium"
                      >
                        Try Again
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>
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
    Readable without signing in.

    The signup form asks you to consent and links here to explain what you are
    consenting to — but the page rendered inside AppShell, which is auth-gated, so
    following that link bounced you to /login. A notice you cannot read until after
    you have agreed to it is not a notice. The endpoint behind it is deliberately
    public for the same reason.
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
