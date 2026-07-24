import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Shield, Trash2, Mail, Lock, Eye, FileText } from "lucide-react";
import { useState } from "react";

import { AppShell, Card, PageHeader } from "@/components/app-shell";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — VivAI" },
      { name: "description", content: "VivAI Privacy Policy — DPDP Act 2023 compliant. We never train on your code." },
    ],
  }),
  component: PrivacyPage,
});

const POLICY_SECTIONS = [
  {
    icon: Eye,
    heading: "Data We Collect",
    body: "We collect your name, email, college, branch, and year during signup. During practice sessions we store transcripts, scores, and delivery metrics. Uploaded code/project files are stored encrypted to generate viva questions.",
  },
  {
    icon: Lock,
    heading: "Purpose Limitation",
    body: "We use your code and project data ONLY to generate viva questions during your session and to produce your private performance report. We NEVER train AI models on your code. Your data is never sold or shared with third parties for marketing.",
  },
  {
    icon: FileText,
    heading: "Data Retention",
    body: "Raw audio/video is processed in real-time and never persisted. Uploaded code files are automatically deleted within 7 days of your last session. Transcripts and scores are retained until you delete your account. You may request full deletion at any time.",
  },
  {
    icon: Shield,
    heading: "Your Rights (DPDP Act 2023)",
    body: "You have the right to: (1) Access your data, (2) Correct inaccurate data, (3) Erase all your data ('Delete My Data' in Profile), (4) Withdraw consent at any time, (5) File a grievance with our officer below.",
  },
  {
    icon: Lock,
    heading: "Data Security",
    body: "All data is encrypted at rest (AES-256) and in transit (TLS 1.3). Data is hosted in India (AWS Mumbai). Access is restricted to authenticated users only.",
  },
  {
    icon: Shield,
    heading: "Minors (Under 18)",
    body: "Users under 18 require verifiable parental/guardian consent. We do not track behavioral analytics for minor users. Aggregated, anonymized data only is used for platform improvement.",
  },
];

function PrivacyPage() {
  const { isAuthenticated } = useAuth();
  const [deleteStatus, setDeleteStatus] = useState<"idle" | "confirming" | "deleting" | "done" | "error">("idle");

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

  return (
    <AppShell>
      <PageHeader
        title="Privacy Policy"
        subtitle="DPDP Act 2023 compliant. Last updated: July 24, 2026. Version 1.0"
      />

      <div className="mx-auto max-w-3xl space-y-5">
        {/* Key guarantee banner */}
        <Card className="border-primary/20 bg-primary/5">
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8 shrink-0 text-primary" />
            <div>
              <p className="font-semibold text-primary">We never train on your code.</p>
              <p className="text-sm text-muted-foreground">
                Your project is encrypted end-to-end. Only you and the AI see it — during the session and in your private report.
              </p>
            </div>
          </div>
        </Card>

        {/* Policy sections */}
        {POLICY_SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <Card key={section.heading}>
              <div className="flex items-start gap-3">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <div>
                  <h3 className="font-semibold">{section.heading}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{section.body}</p>
                </div>
              </div>
            </Card>
          );
        })}

        {/* Grievance Officer */}
        <Card>
          <div className="flex items-start gap-3">
            <Mail className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div>
              <h3 className="font-semibold">Grievance Officer</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                VivAI Data Protection Officer
                <br />
                <a href="mailto:grievance@vivai.app" className="text-primary hover:underline">
                  grievance@vivai.app
                </a>
                <br />
                We respond to all grievances within 7 working days.
              </p>
            </div>
          </div>
        </Card>

        {/* Delete My Data CTA (only if logged in) */}
        {isAuthenticated && (
          <Card className="border-destructive/20">
            <div className="flex items-start gap-3">
              <Trash2 className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div className="flex-1">
                <h3 className="font-semibold text-destructive">Delete My Data</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Permanently erase all your sessions, transcripts, uploads, and scores. This cannot be undone.
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
                      <p className="text-sm text-destructive">Deletion failed. Please contact grievance@vivai.app</p>
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

        {/* Back link */}
        <div className="pb-8">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
