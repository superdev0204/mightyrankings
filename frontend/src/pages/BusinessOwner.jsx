import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Crown, Building, Star, MessageSquare, BarChart3, Shield,
  CheckCircle, Search, Eye, Users, TrendingUp
} from "lucide-react";
import Seo from "@/components/common/Seo";

// ✅ Axios auth helper
import { me as getMe } from "@/api/users";

/** ---------- Copy helpers (shared for businesses & doctors) ---------- */
const LISTING_SINGULAR = "listing";
const LISTING_PLURAL = "listings";
const OWNER_TERM = "owner/practitioner"; // neutral term

const claimSteps = [
  {
    step: 1,
    title: "Find Your Listing",
    description:
      "Search for your business or medical practice on our platform. If it doesn't exist, you can add it first.",
    icon: <Search className="w-8 h-8 text-blue-500" />,
    action: "Search Now",
  },
  {
    step: 2,
    title: "Click 'Claim This Listing'",
    description:
      "On your listing page, click the claim button and fill out the verification form.",
    icon: <Building className="w-8 h-8 text-green-500" />,
    action: "Learn More",
  },
  {
    step: 3,
    title: "Get Verified",
    description:
      "Our team will review your claim and verify your ownership within 1–2 business days.",
    icon: <Shield className="w-8 h-8 text-purple-500" />,
    action: "Start Process",
  },
  {
    step: 4,
    title: "Manage Your Listing",
    description:
      "Once verified, access your owner dashboard to manage reviews and upgrade to premium.",
    icon: <Crown className="w-8 h-8 text-yellow-500" />,
    action: "Dashboard",
  },
];

const benefits = [
  {
    icon: <MessageSquare className="w-6 h-6 text-blue-500" />,
    title: "Respond to Reviews",
    description:
      "Engage with clients/patients by responding to their reviews professionally.",
  },
  {
    icon: <BarChart3 className="w-6 h-6 text-green-500" />,
    title: "Access Analytics",
    description:
      "Get insights into how people find and interact with your listing.",
  },
  {
    icon: <Star className="w-6 h-6 text-yellow-500" />,
    title: "Update Information",
    description:
      "Keep your details, photos, services/specialties, and contact information current.",
  },
  {
    icon: <Crown className="w-6 h-6 text-purple-500" />,
    title: "Premium Features",
    description:
      "Upgrade to premium for priority placement and enhanced visibility.",
  },
  {
    icon: <Eye className="w-6 h-6 text-red-500" />,
    title: "Increased Visibility",
    description:
      "Claimed listings appear more trustworthy and get better placement.",
  },
  {
    icon: <Users className="w-6 h-6 text-indigo-500" />,
    title: "Build Trust",
    description:
      "Show customers and patients that you're actively managing your online presence.",
  },
];

export default function BusinessOwnerPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const u = await getMe();
        setUser(u);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleLogin = () => {
    // keep your auth flow; include ?next= to return after login
    window.location.href = `/login?next=${encodeURIComponent(window.location.href)}`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Seo
        title="Claim Your Listing (Business or Medical Practice) for Free"
        description="Take control of your business or doctor listing on MightyRankings.com. Claiming is free—respond to reviews, update your info, and attract new clients and patients."
      />

      {/* Hero */}
      <section className="bg-gradient-to-r from-blue-600 to-purple-600 text-white py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Crown className="w-16 h-16 mx-auto mb-6 text-yellow-300" />
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            Own a Business or Medical Practice?
          </h1>
          <p className="text-xl md:text-2xl text-blue-100 mb-8 max-w-3xl mx-auto">
            Take control of your {LISTING_SINGULAR}, respond to reviews, and attract more customers and patients.
            Claiming is free and takes just a few minutes.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to={createPageUrl("Search")}>
              <Button size="lg" className="bg-white text-blue-600 hover:bg-gray-100">
                Find My Listing
              </Button>
            </Link>
            {!user && (
              <Button
                size="lg"
                variant="outline"
                className="border-white text-white hover:bg-white hover:text-blue-600"
                onClick={handleLogin}
                disabled={loading}
              >
                Sign In to Get Started
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">How to Claim Your {LISTING_SINGULAR[0].toUpperCase() + LISTING_SINGULAR.slice(1)}</h2>
            <p className="text-gray-600 text-lg max-w-2xl mx-auto">
              Follow these simple steps to take control of your {LISTING_SINGULAR}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {claimSteps.map((step) => (
              <Card key={step.step} className="relative text-center hover:shadow-lg transition-shadow">
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">
                    {step.step}
                  </div>
                </div>
                <CardHeader className="pt-8">
                  <div className="flex justify-center mb-4">{step.icon}</div>
                  <CardTitle className="text-lg">{step.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600 mb-4">{step.description}</p>
                  <Link
                    to={createPageUrl(
                      step.step === 1
                        ? "Search"
                        : step.step === 4
                        ? "OwnerDashboard"
                        : "Search"
                    )}
                  >
                    <Button variant="outline" size="sm">{step.action}</Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Why Claim Your {LISTING_SINGULAR[0].toUpperCase() + LISTING_SINGULAR.slice(1)}?</h2>
            <p className="text-gray-600 text-lg max-w-2xl mx-auto">
              Unlock powerful tools to manage your online reputation and grow your practice
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {benefits.map((b, i) => (
              <div key={i} className="flex items-start space-x-4">
                <div className="flex-shrink-0 w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                  {b.icon}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{b.title}</h3>
                  <p className="text-gray-600">{b.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-900 text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-12">Join Thousands of {OWNER_TERM.split("/").map(s => s.trim()[0].toUpperCase() + s.trim().slice(1)).join(" & ")}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <div className="text-4xl font-bold text-yellow-400 mb-2">
                <TrendingUp className="w-12 h-12 mx-auto mb-4" />
                85%
              </div>
              <p className="text-gray-300">Increase in engagement after claiming</p>
            </div>
            <div>
              <div className="text-4xl font-bold text-yellow-400 mb-2">
                <Star className="w-12 h-12 mx-auto mb-4" />
                4.8
              </div>
              <p className="text-gray-300">Average rating improvement for claimed {LISTING_PLURAL}</p>
            </div>
            <div>
              <div className="text-4xl font-bold text-yellow-400 mb-2">
                <Users className="w-12 h-12 mx-auto mb-4" />
                50K+
              </div>
              <p className="text-gray-300">{OWNER_TERM[0].toUpperCase() + OWNER_TERM.slice(1)} trust our platform</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-green-500 to-blue-500 text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Take Control?</h2>
          <p className="text-xl mb-8">
            Start managing your {LISTING_SINGULAR} reputation today. It's free and takes less than 5 minutes.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to={createPageUrl("Search")}>
              <Button size="lg" className="bg-white text-green-600 hover:bg-gray-100">
                <Search className="w-5 h-5 mr-2" />
                Find My Listing
              </Button>
            </Link>
            <Link to={createPageUrl("AddBusiness")}>
              {/* If you add a dedicated AddDoctor later, you can branch here by querystring or separate CTA */}
              <Button
                size="lg"
                variant="outline"
                className="border-white text-white hover:bg-white hover:text-green-600"
              >
                <Building className="w-5 h-5 mr-2" />
                Add New Listing
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">Frequently Asked Questions</h2>
          <div className="space-y-8">
            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Is claiming my {LISTING_SINGULAR} really free?</h3>
                <p className="text-gray-600">
                  Yes! Claiming your {LISTING_SINGULAR} is completely free. You’ll get access to basic
                  management tools at no cost. Premium features are available for $50/month or $500/year.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">How long does verification take?</h3>
                <p className="text-gray-600">
                  Most claims are verified within 1–2 business days. We may contact you for additional verification if needed.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">What if my {LISTING_SINGULAR} isn’t listed yet?</h3>
                <p className="text-gray-600">
                  No problem! You can add your {LISTING_SINGULAR} to our platform first, then claim it immediately.
                  The entire process takes just a few minutes.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
