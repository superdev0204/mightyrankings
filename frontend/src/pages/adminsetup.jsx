import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, AlertCircle } from "lucide-react";

// ✅ Axios API (replaces Base44)
import { me as getMe, hasAdmin, updateMe, updateUser, login as loginWithRedirect } from "@/api/users";

export default function AdminSetupPage() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    checkStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isAdmin = (u) => u?.user_type === "admin" || u?.role === "admin" || !!u?.is_staff;

  const checkStatus = async () => {
    try {
      // Who am I? (may 401 if not logged in)
      const u = await getMe().catch(() => null);
      setCurrentUser(u);

      // Does any admin already exist? (cheap query)
      const exists = await hasAdmin();

      if (exists) {
        // Setup page no longer relevant
        if (u && isAdmin(u)) {
          navigate(createPageUrl("admindashboard"));
        } else {
          navigate(createPageUrl("Home"));
        }
        return;
      }
      // otherwise: allow setup UI to render
    } catch (err) {
      console.error("Error checking status:", err);
      setCurrentUser(null);
    } finally {
      setLoading(false);
    }
  };

  const makeAdmin = async () => {
    if (!currentUser) return;
    setLoading(true);
    setError("");
    try {
      // Prefer a safe "me" patch (your backend should allow this ONLY when no admin exists)
      try {
        await updateMe({ user_type: "admin" });
      } catch {
        // Fallback if /users/me/ PATCH isn’t implemented
        await updateUser(currentUser.id, { user_type: "admin" });
      }
      navigate(createPageUrl("admindashboard"));
    } catch (err) {
      console.error("Failed to make admin:", err);
      const apiErr =
        err?.response?.data &&
        (err.response.data.detail ||
          Object.values(err.response.data).flat().join(" "));
      setError(apiErr || "Failed to create admin account. Please try again.");
      setLoading(false);
    }
  };

  const handleLogin = () => loginWithRedirect(window.location.href);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p>Loading...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Only rendered if NO admin exists
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardContent className="p-8 text-center">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <div className="flex items-center">
                <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            </div>
          )}

          {!currentUser ? (
            <>
              <AlertCircle className="w-16 h-16 text-blue-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Sign In Required</h2>
              <p className="text-gray-600 mb-6">
                Please sign in to become the site administrator.
              </p>
              <Button onClick={handleLogin} className="w-full" disabled={loading}>
                Sign In
              </Button>
            </>
          ) : (
            <>
              <Shield className="w-16 h-16 text-blue-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Become Administrator</h2>
              <p className="text-gray-600 mb-2">
                Make <strong>{currentUser.email}</strong> the site administrator?
              </p>
              <p className="text-sm text-gray-500 mb-6">
                This will give you access to manage users, businesses, and reviews.
              </p>
              <Button onClick={makeAdmin} className="w-full" disabled={loading}>
                {loading ? "Setting up..." : "Make Me Admin"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
