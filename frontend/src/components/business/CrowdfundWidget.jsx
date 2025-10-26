import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Gift } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { getCampaignForListing, createCrowdfundCheckout } from "@/api/crowdfund";

/**
 * Props:
 *  - business: object with at least { id, name } (doctor is projected upstream)
 *  - entityType: "business" | "doctor"
 *
 * Hardening done here:
 *  - Don't fetch until both listingId AND entityType are known.
 *  - Effect re-runs on (listingId, listingType) changes.
 *  - Clear stale campaign when props change to avoid UI showing previous state.
 */
export default function CrowdfundWidget({ business, entityType = "business" }) {
  const [campaign, setCampaign] = useState(null);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("25");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const listingId = business?.id || null;
  // lock to the two valid values only; ignore anything else
  const listingType = useMemo(() => (entityType === "doctor" ? "doctor" : "business"), [entityType]);

  useEffect(() => {
    // reset when inputs change so we don't show stale campaigns
    setCampaign(null);
    setError("");
  }, [listingId, listingType]);

  useEffect(() => {
    if (!listingId || !listingType) return;
     console.log("[CF] fetch", { listingId, listingType });
    let cancelled = false;

    (async () => {
      try {
        const c = await getCampaignForListing({ id: listingId, type: listingType });
        if (!cancelled) setCampaign(c || null);
      } catch (e) {
        console.error("crowdfund load failed", e);
        if (!cancelled) setCampaign(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [listingId, listingType]);

  if (!listingId || !listingType || !campaign) return null;

  const goal = (campaign.goal_cents || 0) / 100;
  const raised = (campaign.amount_raised_cents || 0) / 100;
  const pct =
    campaign.percent_funded ??
    Math.min(100, Math.round(((campaign.amount_raised_cents || 0) * 100) / Math.max(1, campaign.goal_cents || 0)));

  const quicks = [5, 10, 25, 50, 100];

  const startCheckout = async () => {
    setError("");
    const n = Math.round((parseFloat(amount || "0") || 0) * 100);
    if (!n || n < 100) {
      setError("Minimum contribution is $1.00");
      return;
    }
    setBusy(true);
    try {
      const { url } = await createCrowdfundCheckout({
        id: listingId,
        type: listingType,
        amountCents: n,
        donor_name: name || undefined,
        donor_email: email || undefined,
        return_url: window.location.href.split("#")[0],
      });
      if (url) window.location.href = url;
    } catch (e) {
      setError(e?.response?.data?.detail || e?.message || "Could not start checkout.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Gift className="w-5 h-5 text-teal-600" />
            <h3 className="font-semibold">Crowdfund Premium</h3>
          </div>
          <div className="text-sm text-gray-600">
            ${raised.toFixed(0)} raised of ${goal.toFixed(0)}
          </div>
        </div>

        <div className="w-full bg-gray-200 h-2 rounded mb-3 overflow-hidden">
          <div className="h-2 bg-teal-500" style={{ width: `${pct}%` }} />
        </div>
        <div className="text-xs text-gray-500 mb-4">{pct}% funded</div>

        <Button className="w-full" onClick={() => setOpen(true)}>
          Contribute
        </Button>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Support {business?.name}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label className="text-sm">Choose amount</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {quicks.map((v) => (
                    <Button
                      key={v}
                      type="button"
                      variant={Number(amount) === v ? "default" : "outline"}
                      size="sm"
                      onClick={() => setAmount(String(v))}
                    >
                      ${v}
                    </Button>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-sm text-gray-600">$</span>
                  <Input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                    className="w-32"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm">Your name (optional)</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <Label className="text-sm">Email (optional)</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>

              {error && <div className="text-sm text-red-600">{error}</div>}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={startCheckout} disabled={busy}>
                {busy ? "Starting…" : "Proceed to Payment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
