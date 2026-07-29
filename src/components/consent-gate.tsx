import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Loader2, ShieldCheck, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useProfile } from "@/lib/hooks";

interface ConsentStatus {
  consent_accepted: boolean;
  needs_reconsent: boolean;
  current_version: string;
  is_minor: boolean;
  parental_consent: boolean;
}

/**
 * Asks for privacy consent, and does not take silence for an answer.
 *
 * The backend enforces consent on every endpoint that starts recording or
 * processing a student (`require_consent` in `backend/core/deps.py`). This is the
 * only way to give it: the signup form is the sole place that ever recorded
 * consent, so every Google sign-in account arrives without it, as does every
 * account created before that checkbox existed.
 *
 * Deliberately not dismissable. Under the DPDP Act consent must be a free,
 * informed, unambiguous, affirmative action — which means the answer has to be
 * yes or no, not "closed the box". An earlier version had a "Not now" that simply
 * hid the dialog, which left the student in a state where every practice feature
 * returned a 403 and nothing on screen explained why. Declining is now a real
 * choice with a real, stated consequence, and it is always reversible.
 *
 * Re-asks when the notice version changes: consent recorded against a different
 * description of the processing is not consent to this one.
 */
export function ConsentGate() {
  const { data: profile } = useProfile();
  const { isAuthenticated, logout } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const onPrivacyPage = useRouterState({
    select: (s) => s.location.pathname === "/privacy",
  });
  const [view, setView] = useState<"ask" | "declined">("ask");

  // Authoritative: the server compares the recorded version against the current
  // one, so a notice revision re-asks without the client knowing the rules.
  const { data: status } = useQuery<ConsentStatus>({
    queryKey: ["consent-status"],
    queryFn: () => api<ConsentStatus>("/api/privacy/consent-status"),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  const accept = useMutation({
    mutationFn: () =>
      api("/api/privacy/consent", { method: "POST", body: { consent_type: "privacy" } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consent-status"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success("Thanks — you're all set.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Wait for both before deciding: flashing a consent dialog at somebody who
  // already consented is its own bug.
  if (!isAuthenticated || !profile || !status) return null;
  if (status.consent_accepted && !status.needs_reconsent) return null;

  const revision = status.consent_accepted && status.needs_reconsent;

  /*
    On the notice page the question becomes a sticky bar, never a modal.

    Driven by the route rather than by local state on purpose. "Read the full
    notice" previously navigated to /privacy while leaving the dialog open on top
    of it, so the button appeared to do nothing — and on /privacy itself it
    genuinely did nothing, since the student was already there. Tracking a
    "reading" flag in state does not fix it either: every route renders its own
    AppShell, so navigating remounts this component and any flag resets, putting
    the modal straight back over the page they asked to read.

    The route is the one fact that survives the remount.
  */
  if (onPrivacyPage) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 p-4 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm">
            <span className="font-semibold">Take your time.</span>{" "}
            <span className="text-muted-foreground">
              Practice sessions stay switched off until you accept. Everything else works either
              way.
            </span>
          </p>
          <Button className="shrink-0" onClick={() => accept.mutate()} disabled={accept.isPending}>
            {accept.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Accept and continue
          </Button>
        </div>
      </div>
    );
  }

  if (view === "declined") {
    return (
      <StrictDialog>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-warning" aria-hidden="true" />
            Practice sessions are switched off
          </DialogTitle>
          <DialogDescription>
            That is a valid choice, and it changes nothing else about your account. Without consent
            we cannot lawfully record or grade a session, so these stay unavailable:
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-1.5 text-sm text-muted-foreground">
          <li>AI Mock Viva, Presentation, Pitch Drill and Live Coach</li>
          <li>Code-aware viva and any project upload</li>
          <li>Team Viva, including assessed sessions your faculty schedules</li>
        </ul>
        <p className="text-sm text-muted-foreground">
          Everything else still works — your projects, teams, tasks, files, templates and past
          reports. You can accept whenever you want, and withdraw again just as easily.
        </p>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => logout()}>
            Sign out
          </Button>
          <Button variant="ghost" onClick={() => void navigate({ to: "/privacy" })}>
            Read the notice
          </Button>
          <Button variant="outline" onClick={() => setView("ask")}>
            Go back
          </Button>
          <Button onClick={() => accept.mutate()} disabled={accept.isPending}>
            {accept.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Accept and continue
          </Button>
        </div>
      </StrictDialog>
    );
  }

  return (
    <StrictDialog>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
          {revision ? "Our privacy notice has changed" : "Before your first session"}
        </DialogTitle>
        <DialogDescription>
          {revision
            ? `We have rewritten the notice (version ${status.current_version}). Because it describes the processing differently, we have to ask again — your earlier consent does not carry over.`
            : "Practice sessions record what you say and grade it. Indian law requires your consent before any of that starts."}
        </DialogDescription>
      </DialogHeader>

      <ul className="space-y-2 text-sm text-muted-foreground">
        <li>
          Your transcript, scores and delivery measurements are stored against your account. Live
          audio and video are not kept.
        </li>
        <li>
          Your speech and any code you upload are sent to Google&apos;s Gemini API, which runs the
          AI examiner. That processing may happen outside India.
        </li>
        <li>We never train models on your code, and we never sell or advertise with your data.</li>
        <li>
          You can withdraw consent or erase everything from your profile at any time, as easily as
          you gave it.
        </li>
      </ul>
      {status.is_minor && !status.parental_consent && (
        <p className="rounded-lg bg-warning/10 p-3 text-sm text-foreground">
          You told us you are under 18. The DPDP Act requires your parent or guardian to give this
          consent with you, and we do not run behavioural analytics or advertising on your account.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Given under the Digital Personal Data Protection Act 2023 and the DPDP Rules 2025. Notice
        version {status.current_version}.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        <Button variant="ghost" onClick={() => void navigate({ to: "/privacy" })}>
          Read the full notice
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setView("declined")}>
            Decline
          </Button>
          <Button onClick={() => accept.mutate()} disabled={accept.isPending}>
            {accept.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Accept and continue
          </Button>
        </div>
      </div>
    </StrictDialog>
  );
}

/**
 * A dialog with no way out except answering it.
 *
 * No corner X, Escape does nothing, clicking the backdrop does nothing. Consent
 * has to be an affirmative act, so "dismissed it" must not be one of the states
 * this component can be left in.
 */
function StrictDialog({ children }: { children: React.ReactNode }) {
  return (
    <Dialog open>
      <DialogContent
        hideClose
        className="sm:max-w-lg"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}
