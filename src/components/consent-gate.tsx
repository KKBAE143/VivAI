import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { useProfile } from "@/lib/hooks";

/**
 * Asks for privacy consent when the account does not have it on record.
 *
 * The backend now enforces consent on every endpoint that starts recording or
 * processing a student (see `require_consent` in `backend/core/deps.py`), which
 * it previously did not despite the gate existing. Enforcement alone would have
 * locked people out with no way back in: the signup form is the only place that
 * ever recorded consent, so **every Google sign-in account has none**, and so
 * does every account created before that checkbox existed.
 *
 * So this asks up front, from the profile the shell has already loaded — no
 * extra request on a normal page load. Dismissable on purpose: it must not trap
 * someone who wants to read the policy first, and refusing only blocks the
 * session features, which is the honest consequence rather than a locked app.
 */
export function ConsentGate() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(false);

  const accept = useMutation({
    mutationFn: () =>
      api("/api/privacy/consent", { method: "POST", body: { consent_type: "privacy" } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success("Thanks — you're all set.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Wait for the profile rather than assuming the worst: flashing a consent
  // dialog at someone who already consented is its own bug.
  if (!profile) return null;
  const needsConsent = !profile.consent_accepted_at;
  if (!needsConsent || dismissed) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && setDismissed(true)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            Before your first session
          </DialogTitle>
          <DialogDescription>
            Practice sessions record a transcript and scores. We need your consent under the DPDP
            Act 2023 before any of that starts.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>Transcripts, scores and delivery metrics are stored against your account.</li>
          <li>Raw audio and video are processed live and never kept.</li>
          <li>Your code is used to generate your questions. We never train models on it.</li>
          <li>You can withdraw consent or erase everything from your profile at any time.</li>
        </ul>

        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" asChild>
            <Link to="/privacy">Read the full policy</Link>
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setDismissed(true)}>
              Not now
            </Button>
            <Button onClick={() => accept.mutate()} disabled={accept.isPending}>
              {accept.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Accept and continue
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
