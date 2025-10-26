import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { me as getMe, updateMe, login as loginWithRedirect } from "@/api/users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Settings as SettingsIcon,
  Bell,
  Shield,
  Eye,
  Mail,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  LogIn,
} from "lucide-react";

const DEFAULT_PREFS = {
  email_notifications: true,
  review_notifications: true,
  marketing_emails: false,
  profile_public: true,
  show_email_public: false,
  auto_approve_reviews: true,
};

function loadLocalPrefs(userId) {
  try {
    const raw = localStorage.getItem(`mr:prefs:${userId}`);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : { ...DEFAULT_PREFS };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function saveLocalPrefs(userId, prefs) {
  try {
    localStorage.setItem(`mr:prefs:${userId}`, JSON.stringify(prefs));
  } catch {}
}

export default function SettingsPage() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  // API-backed editable fields
  const [bio, setBio] = useState("");
  const [profileImage, setProfileImage] = useState("");

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      setLoading(true);
      setError("");
      try {
        const me = await getMe(); // GET /api/users/me/
        if (!mounted) return;

        setUser(me);
        setBio(me.bio || "");
        setProfileImage(me.profile_image || "");
        setPrefs(loadLocalPrefs(me.id));
      } catch (e) {
        // Not logged in → show sign in UI
        setUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    run();
    return () => {
      mounted = false;
    };
  }, []);

  const onToggle = (key, value) => {
    setPrefs((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);
    setError("");
    try {
      // Save UI-only preferences locally (until backend fields exist)
      saveLocalPrefs(user.id, prefs);

      // Save API-backed fields with /users/me/
      await updateMe({
        bio,
        profile_image: profileImage,
      });

      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } catch (e) {
      console.error("Error updating settings:", e);
      setError("Failed to update settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Skeleton className="h-8 w-48 mb-8" />
          <div className="space-y-6">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <SettingsIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Settings</h2>
            <p className="text-gray-600 mb-6">You need to be signed in to access settings.</p>
            <Button onClick={() => loginWithRedirect()} className="w-full">
              <LogIn className="w-4 h-4 mr-2" />
              Sign in with Google
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Button variant="ghost" onClick={() => navigate("/")} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <SettingsIcon className="w-8 h-8" />
            Account Settings
          </h1>
          <p className="text-gray-600 mt-2">Manage your account preferences and privacy settings</p>
        </div>

        {success && (
          <Alert className="mb-6 border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">Settings updated successfully!</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-6">
          {/* Notification Settings (local-only for now) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Notification Preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="email-notifications">Email Notifications</Label>
                  <p className="text-sm text-gray-500">
                    Device-only preference (not yet synced to your account)
                  </p>
                </div>
                <Switch
                  id="email-notifications"
                  checked={prefs.email_notifications}
                  onCheckedChange={(v) => onToggle("email_notifications", v)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="review-notifications">Review Notifications</Label>
                  <p className="text-sm text-gray-500">
                    Device-only preference (not yet synced to your account)
                  </p>
                </div>
                <Switch
                  id="review-notifications"
                  checked={prefs.review_notifications}
                  onCheckedChange={(v) => onToggle("review_notifications", v)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="marketing-emails">Marketing Emails</Label>
                  <p className="text-sm text-gray-500">
                    Device-only preference (not yet synced to your account)
                  </p>
                </div>
                <Switch
                  id="marketing-emails"
                  checked={prefs.marketing_emails}
                  onCheckedChange={(v) => onToggle("marketing_emails", v)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Privacy Settings (local-only for now) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="w-5 h-5" />
                Privacy Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="profile-public">Public Profile</Label>
                  <p className="text-sm text-gray-500">
                    Device-only preference (not yet synced to your account)
                  </p>
                </div>
                <Switch
                  id="profile-public"
                  checked={prefs.profile_public}
                  onCheckedChange={(v) => onToggle("profile_public", v)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="show-email">Show Email Publicly</Label>
                  <p className="text-sm text-gray-500">
                    Device-only preference (not yet synced to your account)
                  </p>
                </div>
                <Switch
                  id="show-email"
                  checked={prefs.show_email_public}
                  onCheckedChange={(v) => onToggle("show_email_public", v)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Business Owner Settings (local-only for now) */}
          {user && user.user_type === "owner" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Business Owner Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="auto-approve">Auto-approve Reviews</Label>
                    <p className="text-sm text-gray-500">
                      Device-only preference (not yet synced to your account)
                    </p>
                  </div>
                  <Switch
                    id="auto-approve"
                    checked={prefs.auto_approve_reviews}
                    onCheckedChange={(v) => onToggle("auto_approve_reviews", v)}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Account Information (API-backed editable fields) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5" />
                Account Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Full Name</Label>
                  <Input value={user.full_name || ""} disabled className="mt-1" />
                </div>
                <div>
                  <Label>Email Address</Label>
                  <Input value={user.email || ""} disabled className="mt-1" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="profileImage">Profile Image URL</Label>
                  <Input
                    id="profileImage"
                    value={profileImage}
                    onChange={(e) => setProfileImage(e.target.value)}
                    placeholder="https://…"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="bio">Bio</Label>
                  <Textarea
                    id="bio"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Tell people a bit about you…"
                    className="mt-1"
                  />
                </div>
              </div>

              <p className="text-sm text-gray-500">
                Name and email changes require contacting support.
              </p>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          </div>

          {/* Danger Zone */}
          <Card className="border-red-200">
            <CardHeader>
              <CardTitle className="text-red-600">Danger Zone</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-red-50 p-4 rounded-lg">
                <h3 className="font-semibold text-red-800 mb-2">Delete Account</h3>
                <p className="text-red-600 text-sm mb-4">
                  Once you delete your account, there is no going back. This action cannot be undone.
                </p>
                <Button
                  variant="destructive"
                  onClick={() =>
                    alert("Account deletion is not yet implemented. Please contact support to delete your account.")
                  }
                >
                  Delete Account
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}