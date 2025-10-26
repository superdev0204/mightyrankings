import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { me as getCurrentUser, updateMe as updateCurrentUser, loginWithRedirect } from "@/api/users";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  User as UserIcon,
  Mail,
  Calendar,
  Star,
  Building,
  Crown,
  Shield,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";

export default function ProfilePage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  // include full_name to allow editing
  const [formData, setFormData] = useState({
    full_name: "",
    bio: "",
    profile_image: "",
  });

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const userData = await getCurrentUser();
      // derive a best-effort full name if API didn't send full_name
      const derivedFullName = (userData.full_name ||
        [userData.first_name, userData.last_name].filter(Boolean).join(" ")).trim();

      setUser(userData);
      setFormData({
        full_name: derivedFullName || "",
        bio: userData.bio || "",
        profile_image: userData.profile_image || "",
      });
    } catch (e) {
      setUser(null);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const updated = await updateCurrentUser({
        full_name: formData.full_name,
        bio: formData.bio,
        profile_image: formData.profile_image,
      });
      setUser(updated);
      setSuccess(true);
      setEditing(false);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      console.error("Error updating profile:", e);
      setError("Failed to update profile. Please try again.");
    }
    setSaving(false);
  };

  const getUserTypeIcon = (userType) => {
    switch (userType) {
      case "admin":
        return <Shield className="w-5 h-5 text-red-500" />;
      case "owner":
        return <Building className="w-5 h-5 text-blue-500" />;
      default:
        return <UserIcon className="w-5 h-5 text-gray-500" />;
    }
  };

  const getUserTypeName = (userType) => {
    switch (userType) {
      case "admin":
        return "Administrator";
      case "owner":
        return "Business Owner";
      default:
        return "Reviewer";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Skeleton className="h-8 w-48 mb-8" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <Skeleton className="h-96 w-full" />
            <div className="lg:col-span-2 space-y-6">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
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
            <UserIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Profile Access</h2>
            <p className="text-gray-600 mb-6">You need to be signed in to view your profile.</p>
            <Button onClick={() => loginWithRedirect(window.location.href)} className="w-full">
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const joined = user.created_date ? new Date(user.created_date) : null;

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">My Profile</h1>
          <p className="text-gray-600 mt-2">Manage your account information and preferences</p>
        </div>

        {success && (
          <Alert className="mb-6 border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              Profile updated successfully!
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Profile Card */}
          <Card>
            <CardContent className="p-6 text-center">
              <div className="mb-4">
                {user.profile_image ? (
                  <img
                    src={user.profile_image}
                    alt={user.full_name || "User"}
                    className="w-24 h-24 rounded-full mx-auto object-cover"
                  />
                ) : (
                  <div className="w-24 h-24 bg-gradient-to-r from-red-500 to-orange-500 rounded-full flex items-center justify-center mx-auto">
                    <span className="text-white font-bold text-2xl">
                      {(user.full_name || "U")?.[0] || "U"}
                    </span>
                  </div>
                )}
              </div>

              <h2 className="text-xl font-bold text-gray-900 mb-2">
                {user.full_name || formData.full_name || "—"}
              </h2>

              <div className="flex items-center justify-center gap-2 mb-4">
                {getUserTypeIcon(user.user_type)}
                <Badge variant="secondary">{getUserTypeName(user.user_type)}</Badge>
                {user.premium_membership && (
                  <Badge className="bg-gradient-to-r from-yellow-400 to-orange-400 text-black">
                    <Crown className="w-3 h-3 mr-1" />
                    Premium
                  </Badge>
                )}
              </div>

              <div className="space-y-3 text-sm text-gray-600">
                <div className="flex items-center justify-center gap-2">
                  <Mail className="w-4 h-4" />
                  <span>{user.email}</span>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <span>
                    Joined {joined ? format(joined, "MMMM yyyy") : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <Star className="w-4 h-4" />
                  <span>{user.total_reviews || 0} reviews written</span>
                </div>
                {user.claimed_businesses?.length > 0 && (
                  <div className="flex items-center justify-center gap-2">
                    <Building className="w-4 h-4" />
                    <span>{user.claimed_businesses.length} businesses claimed</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Profile Details */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Profile Information</span>
                  <Button variant="outline" onClick={() => setEditing(!editing)} disabled={saving}>
                    {editing ? "Cancel" : "Edit Profile"}
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label htmlFor="full_name">Full Name</Label>
                    {editing ? (
                      <Input
                        id="full_name"
                        value={formData.full_name}
                        onChange={(e) =>
                          setFormData((p) => ({ ...p, full_name: e.target.value }))
                        }
                        placeholder="Your full name"
                        className="mt-1"
                      />
                    ) : (
                      <Input value={user.full_name || "—"} disabled className="mt-1" />
                    )}
                  </div>
                  <div>
                    <Label>Email Address</Label>
                    <Input value={user.email} disabled className="mt-1" />
                  </div>
                </div>

                <div>
                  <Label htmlFor="profile_image">Profile Image URL</Label>
                  {editing ? (
                    <Input
                      id="profile_image"
                      type="url"
                      value={formData.profile_image}
                      onChange={(e) =>
                        setFormData((p) => ({ ...p, profile_image: e.target.value }))
                      }
                      placeholder="https://example.com/your-photo.jpg"
                      className="mt-1"
                    />
                  ) : (
                    <Input value={user.profile_image || "No image set"} disabled className="mt-1" />
                  )}
                </div>

                <div>
                  <Label htmlFor="bio">Bio</Label>
                  {editing ? (
                    <Textarea
                      id="bio"
                      value={formData.bio}
                      onChange={(e) => setFormData((p) => ({ ...p, bio: e.target.value }))}
                      placeholder="Tell us about yourself..."
                      rows={4}
                      className="mt-1"
                    />
                  ) : (
                    <Textarea value={user.bio || "No bio set"} disabled rows={4} className="mt-1" />
                  )}
                </div>

                {editing && (
                  <div className="flex gap-4">
                    <Button onClick={handleSave} disabled={saving} className="flex-1">
                      {saving ? "Saving..." : "Save Changes"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditing(false);
                        setFormData({
                          full_name: user.full_name || "",
                          bio: user.bio || "",
                          profile_image: user.profile_image || "",
                        });
                      }}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Account Stats */}
            <Card>
              <CardHeader>
                <CardTitle>Account Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900">
                      {user.total_reviews || 0}
                    </div>
                    <div className="text-sm text-gray-500">Reviews Written</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900">
                      {user.claimed_businesses?.length || 0}
                    </div>
                    <div className="text-sm text-gray-500">Businesses Claimed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-900">
                      {user.verified ? "Verified" : "Standard"}
                    </div>
                    <div className="text-sm text-gray-500">Account Status</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
