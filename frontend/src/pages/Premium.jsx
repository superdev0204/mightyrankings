import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Crown, MessageSquare, Zap, Settings } from "lucide-react";
import Seo from "@/components/common/Seo";
import { loadStripe } from "@stripe/stripe-js";

// who am I?
import { me as getMe } from "@/api/users";
import { createCheckoutSession, createPortalSession } from "@/api/billing";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || "");

const premiumFeatures = [
  { icon: <Zap className="w-6 h-6 text-yellow-500" />, title: "Priority Placement", description: "Your business floats to the top of search and category pages." },
  { icon: <Crown className="w-6 h-6 text-yellow-500" />, title: "Premium Badge", description: "Stand out with a gold badge on your profile and cards." },
  { icon: <MessageSquare className="w-6 h-6 text-yellow-500" />, title: "Respond to Reviews", description: "Engage publicly with your customers (owner replies)." },
];

const testimonials = [
  { quote: "Upgrading to Premium was a game-changer. Our bookings increased by 40% in the first month!", name: "Sarah L.", business: "The Gourmet Kitchen" },
  { quote: "Responding to reviews helped us build trust and improve faster.", name: "Mike D.", business: "Cityscape Gym" },
  { quote: "Priority placement noticeably increased our inbound leads.", name: "Chen W.", business: "Zen Garden Spa" },
];

export default function PremiumPage() {
  const [user, setUser] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const u = await getMe().catch(() => null);
        setUser(u);
      } catch {}
    })();
  }, []);

  const goCheckout = async (plan) => {
    if (!user) {
      // send them to sign in; after auth send back here
      window.location.href = createPageUrl(
        `login?next=${encodeURIComponent(window.location.href)}`
      );
      return;
    }
    setBusy(true);
    try {
      const success_url = new URL(createPageUrl("OwnerDashboard"), window.location.origin).toString();
      const cancel_url = window.location.href;
      const session = await createCheckoutSession({ plan, success_url, cancel_url });
      // Prefer Stripe-hosted URL if returned; else redirect via sessionId
      const stripe = await stripePromise;
      if (session.url) {
        window.location.assign(session.url);
      } else if (session.id && stripe) {
        const { error } = await stripe.redirectToCheckout({ sessionId: session.id });
        if (error) alert(error.message || "Checkout redirection failed.");
      } else {
        alert("Unexpected checkout response.");
      }
    } catch (err) {
      alert(
        err?.response?.data?.detail ||
          err?.message ||
          "Failed to start checkout."
      );
    } finally {
      setBusy(false);
    }
  };

  const openPortal = async () => {
    setBusy(true);
    try {
      const r = await createPortalSession({
        return_url: new URL(createPageUrl("OwnerDashboard"), window.location.origin).toString(),
      });
      if (r.url) window.location.assign(r.url);
      else alert("Unable to open billing portal.");
    } catch (err) {
      alert(
        err?.response?.data?.detail ||
          err?.message ||
          "Failed to open billing portal."
      );
    } finally {
      setBusy(false);
    }
  };

  const isPremium = !!(user && user.premium_membership);

  return (
    <div className="bg-white animate-fade-in-up">
      <Seo
        title="Premium for Businesses"
        description="Upgrade to Premium to get higher placement, a trust badge, owner replies, and more."
      />
      {/* Hero */}
      <section className="relative bg-gray-900 text-white py-20 px-4 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-gradient-to-r from-yellow-600 via-orange-600 to-red-700 opacity-80"></div>
        <div className="relative max-w-4xl mx-auto text-center">
          <Crown className="w-16 h-16 mx-auto mb-6 text-yellow-300" />
          <h1 className="text-4xl md:text-6xl font-bold mb-4">
            Unlock Your Business's Potential
          </h1>
          <p className="text-xl md:text-2xl text-yellow-100 mb-8">
            Go Premium to get seen by more customers, build trust, and grow faster.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {!isPremium ? (
              <>
                <Button
                  size="lg"
                  className="bg-white text-gray-900 hover:bg-gray-200 premium-glow"
                  onClick={() => goCheckout("yearly")}
                  disabled={busy}
                >
                  Choose Yearly (Best Value)
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white text-white hover:bg-white hover:text-gray-900"
                  onClick={() => goCheckout("monthly")}
                  disabled={busy}
                >
                  Choose Monthly
                </Button>
              </>
            ) : (
              <>
                <Badge className="bg-yellow-500 text-black font-semibold self-center">You’re Premium</Badge>
                <Button size="lg" onClick={openPortal} disabled={busy} className="bg-white text-gray-900 hover:bg-gray-200">
                  <Settings className="w-4 h-4 mr-2" />
                  Manage Billing
                </Button>
                <Link to={createPageUrl("OwnerDashboard")}>
                  <Button size="lg" variant="outline" className="border-white text-white hover:bg-white hover:text-gray-900">
                    Go to Owner Dashboard
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Premium Features</h2>
            <p className="text-gray-600 text-lg max-w-2xl mx-auto">
              Everything you need to stand out, engage customers, and grow.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {premiumFeatures.map((f, i) => (
              <div key={i} className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
                  {f.icon}
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">{f.title}</h3>
                  <p className="text-gray-600">{f.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Simple, Transparent Pricing</h2>
            <p className="text-gray-600 text-lg">Choose the plan that's right for your business.</p>
          </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Monthly */}
          <Card className="flex flex-col">
            <CardHeader><CardTitle className="text-2xl">Monthly</CardTitle></CardHeader>
            <CardContent className="flex-1">
              <p className="text-5xl font-bold mb-2">$50<span className="text-lg font-normal text-gray-500">/month</span></p>
              <p className="text-gray-600 mb-6">Flexibility for your business. Cancel anytime.</p>
              <ul className="space-y-3">
                {premiumFeatures.slice(0,3).map((f, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span className="text-gray-700">{f.title}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <div className="p-6 mt-auto">
              <Button className="w-full" variant="outline" onClick={() => goCheckout("monthly")} disabled={busy}>
                Choose Monthly
              </Button>
            </div>
          </Card>

          {/* Yearly */}
          <Card className="border-2 border-yellow-500 relative flex flex-col premium-glow">
            <Badge className="absolute -top-3 right-6 bg-yellow-500 text-black font-semibold">BEST VALUE</Badge>
            <CardHeader><CardTitle className="text-2xl">Yearly</CardTitle></CardHeader>
            <CardContent className="flex-1">
              <p className="text-5xl font-bold mb-2">$500<span className="text-lg font-normal text-gray-500">/year</span></p>
              <p className="text-gray-600 mb-6">Save $100 with our annual plan.</p>
              <ul className="space-y-3">
                {premiumFeatures.map((f, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span className="text-gray-700">{f.title}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <div className="p-6 mt-auto">
              <Button className="w-full bg-yellow-500 text-black hover:bg-yellow-600" onClick={() => goCheckout("yearly")} disabled={busy}>
                Choose Yearly
              </Button>
            </div>
          </Card>
        </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Loved by Businesses Like Yours</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {testimonials.map((t, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <p className="text-gray-700 mb-6">"{t.quote}"</p>
                  <div className="flex items-center">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-r from-red-500 to-orange-500 flex items-center justify-center text-white font-bold">
                      {t.name.charAt(0)}
                    </div>
                    <div className="ml-4">
                      <p className="font-semibold text-gray-900">{t.name}</p>
                      <p className="text-gray-500 text-sm">{t.business}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}