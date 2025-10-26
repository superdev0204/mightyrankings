import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Check, X, Shield, Building, User as UserIcon, Plus, UserPlus,
  AlertCircle, CheckCircle, Loader2, Edit3, Info,
} from "lucide-react";
import { format } from "date-fns";
import { Switch } from "@/components/ui/switch";

// ✅ Axios API
import { listUsers, createUser, updateUser, me as getMe } from "@/api/users";

export default function AdminManageUsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [filter, setFilter] = useState("pending");
  const [query, setQuery] = useState("");

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addingUser, setAddingUser] = useState(false);

  const [message, setMessage] = useState({ type: "", text: "" });

  const [newUserData, setNewUserData] = useState({
    full_name: "",
    email: "",
    user_type: "reviewer",
    status: "active",
  });

  // Send email toggle (applies to status changes + save in edit dialog)
  const [sendEmail, setSendEmail] = useState(true);

  // Who am I? (to gate actions)
  const [currentUser, setCurrentUser] = useState(null);
  const [checkingAdmin, setCheckingAdmin] = useState(true);

  // Track which row is currently patching to show spinners/disable buttons
  const [rowSaving, setRowSaving] = useState({}); // { [id]: true }

  // --- Edit dialog state ---
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingUser, setEditingUser] = useState(null); // the original user object
  const [editForm, setEditForm] = useState(null);       // mutable form state
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    bootstrap();
  }, []);

  const bootstrap = async () => {
    setCheckingAdmin(true);
    try {
      const me = await getMe(); // requires you to be logged in
      setCurrentUser(me || null);
    } catch {
      setCurrentUser(null);
    } finally {
      setCheckingAdmin(false);
    }
    await loadUsers();
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      const all = await listUsers({ ordering: "-date_joined" }); // admin-only
      setUsers(all);
    } catch (error) {
      console.error("Failed to load users:", error);
      showMessage("error", humanizeError(error, "Failed to load users."));
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: "", text: "" }), 5000);
  };

  const humanizeError = (error, fallback = "Request failed.") => {
    const detail =
      error?.response?.data?.detail ||
      (error?.response?.data &&
        Object.values(error.response.data).flat().join(" "));
    const code = error?.response?.status;
    if (code === 403) return "You do not have permission to perform this action (403).";
    if (code === 401) return "You are not authenticated. Please sign in.";
    return detail || fallback;
  };

  const isAdmin = !!(
    currentUser &&
    (currentUser.is_staff || currentUser.user_type === "admin")
  );

  const handleUpdateUserStatus = async (u, newStatus) => {
    if (!isAdmin) {
      showMessage("error", "Admin privileges required.");
      return;
    }
    setRowSaving((s) => ({ ...s, [u.id]: true }));
    try {
      await updateUser(u.id, { status: newStatus }, { notify: sendEmail });
      await loadUsers();
      showMessage("success", `Updated ${u.full_name} to "${newStatus}".`);
    } catch (error) {
      console.error(`Failed to update user ${u.id}:`, error);
      showMessage("error", humanizeError(error, "Failed to update user status."));
    } finally {
      setRowSaving((s) => {
        const { [u.id]: _drop, ...rest } = s;
        return rest;
      });
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!isAdmin) {
      showMessage("error", "Admin privileges required.");
      return;
    }
    if (!newUserData.full_name.trim() || !newUserData.email.trim()) {
      showMessage("error", "Please fill in all required fields.");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newUserData.email)) {
      showMessage("error", "Please enter a valid email address.");
      return;
    }

    setAddingUser(true);
    try {
      await createUser(newUserData, { notify: sendEmail });
      setNewUserData({
        full_name: "",
        email: "",
        user_type: "reviewer",
        status: "active",
      });
      setShowAddDialog(false);
      showMessage("success", `User ${newUserData.full_name} has been created.`);
      await loadUsers();
    } catch (error) {
      console.error("Failed to create user:", error);
      const txt = humanizeError(error, "Failed to create user.");
      showMessage("error", txt);
    } finally {
      setAddingUser(false);
    }
  };

  const handleInputChange = (field, value) => {
    setNewUserData((prev) => ({ ...prev, [field]: value }));
  };

  const statusVariant = {
    pending: "secondary",
    active: "default",
    suspended: "destructive",
  };

  const userTypeIcon = {
    admin: <Shield className="w-4 h-4 text-red-500" />,
    owner: <Building className="w-4 h-4 text-blue-500" />,
    reviewer: <UserIcon className="w-4 h-4 text-gray-500" />,
  };

  // --- search and tab filter (client-side search over name/email) ---
  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byStatus = (u) => filter === "all" || String(u.status) === filter;
    const byQuery = (u) =>
      !q ||
      (u.full_name && u.full_name.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q));
    return users.filter((u) => byStatus(u) && byQuery(u));
  }, [users, filter, query]);

  const getJoinedDate = (u) =>
    u.created_at || u.created_date || u.date_joined || u.joined;

  // ---------------- Edit dialog helpers ----------------
  const openEdit = (u) => {
    setEditingUser(u);
    setEditForm({
      full_name: u.full_name || "",
      email: u.email || "",
      user_type: u.user_type || "reviewer",
      status: u.status || "pending",
      premium_membership: Boolean(u.premium_membership),
      premium_expires: u.premium_expires || "",
      profile_image: u.profile_image || "",
      bio: u.bio || "",
      verified: Boolean(u.verified),
    });
    setShowEditDialog(true);
  };

  // Build a diff to avoid sending read-only fields or unchanged data.
  const buildDiff = (orig, form) => {
    const out = {};
    const consider = [
      "full_name",
      "user_type",
      "status",
      "premium_membership",
      "premium_expires",
      "profile_image",
      "bio",
      // omit: email, verified (read-only in serializer by default)
    ];
    consider.forEach((k) => {
      const a = orig?.[k];
      const b = form?.[k];
      // normalize empty strings to null where it makes sense
      if (k === "premium_expires" && b === "") {
        if (a !== null && a !== "") out[k] = null;
        return;
      }
      if (a !== b) out[k] = b;
    });
    return out;
  };

  const saveEdit = async () => {
    if (!isAdmin || !editingUser || !editForm) return;
    const payload = buildDiff(editingUser, editForm);
    if (Object.keys(payload).length === 0) {
      setShowEditDialog(false);
      return;
    }
    setSavingEdit(true);
    try {
      await updateUser(editingUser.id, payload, { notify: sendEmail });
      setShowEditDialog(false);
      setEditingUser(null);
      setEditForm(null);
      await loadUsers();
      showMessage("success", "User updated.");
    } catch (err) {
      console.error("update user failed", err);
      showMessage("error", humanizeError(err, "Failed to update user."));
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold">Manage Users</h1>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2">
            <Switch id="send-email" checked={sendEmail} onCheckedChange={setSendEmail} />
            <Label htmlFor="send-email">Send email notification</Label>
          </div>
          <Button onClick={() => setShowAddDialog(true)} className="flex items-center gap-2" disabled={!isAdmin || checkingAdmin}>
            <UserPlus className="w-4 h-4" />
            Add User
          </Button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="suspended">Suspended</TabsTrigger>
            <TabsTrigger value="all">All Users</TabsTrigger>
          </TabsList>
          <TabsContent value={filter} />
        </Tabs>

        <div className="flex-1 md:max-w-xs">
          <Input
            placeholder="Search name or email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {message.text && (
        <Alert variant={message.type === "error" ? "destructive" : "default"} className="mb-4">
          {message.type === "success" ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      {!checkingAdmin && !isAdmin && (
        <Alert className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You’re signed in, but don’t have admin privileges. Actions are disabled.
          </AlertDescription>
        </Alert>
      )}

      <div className="mt-4 rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Joined On</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan="5" className="text-center">Loading...</TableCell>
              </TableRow>
            ) : filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan="5" className="text-center">No users found.</TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((u) => {
                const saving = !!rowSaving[u.id];
                const joined = getJoinedDate(u);
                const joinedText = joined ? format(new Date(joined), "MMM d, yyyy") : "—";
                return (
                  <TableRow key={u.id} className="hover:bg-muted/50 cursor-pointer" onClick={(e) => {
                    // avoid row click when action buttons clicked
                    const tag = (e.target.tagName || "").toLowerCase();
                    if (["button", "svg", "path"].includes(tag)) return;
                    openEdit(u);
                  }}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-r from-red-500 to-orange-500 rounded-full flex items-center justify-center">
                          <span className="text-white font-semibold text-sm">
                            {u.full_name?.[0]?.toUpperCase() || "U"}
                          </span>
                        </div>
                        <div>
                          <div className="font-medium">{u.full_name}</div>
                          <div className="text-sm text-muted-foreground">{u.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[u.status] || "secondary"}>{u.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {userTypeIcon[u.user_type] || <UserIcon className="w-4 h-4 text-gray-500" />}
                        <span>{u.user_type}</span>
                      </div>
                    </TableCell>
                    <TableCell>{joinedText}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openEdit(u)}
                        disabled={!isAdmin}
                      >
                        <Edit3 className="w-4 h-4 mr-2" />
                        View / Edit
                      </Button>

                      {u.status === "pending" && (
                        <Button
                          size="sm"
                          onClick={() => handleUpdateUserStatus(u, "active")}
                          disabled={!isAdmin || saving}
                        >
                          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                          {saving ? "Updating…" : "Approve"}
                        </Button>
                      )}
                      {u.status === "active" && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleUpdateUserStatus(u, "suspended")}
                          disabled={!isAdmin || saving}
                        >
                          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <X className="w-4 h-4 mr-2" />}
                          {saving ? "Updating…" : "Suspend"}
                        </Button>
                      )}
                      {u.status === "suspended" && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleUpdateUserStatus(u, "active")}
                          disabled={!isAdmin || saving}
                        >
                          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                          {saving ? "Updating…" : "Reactivate"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add User Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              Add New User
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleAddUser}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name *</Label>
                <Input
                  id="full_name"
                  value={newUserData.full_name}
                  onChange={(e) => handleInputChange("full_name", e.target.value)}
                  placeholder="Enter user's full name"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  value={newUserData.email}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  placeholder="Enter user's email address"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="user_type">User Type</Label>
                <Select
                  value={newUserData.user_type}
                  onValueChange={(value) => handleInputChange("user_type", value)}
                >
                  <SelectTrigger><SelectValue placeholder="Select user type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reviewer">
                      <div className="flex items-center gap-2">
                        <UserIcon className="w-4 h-4 text-gray-500" />
                        <span>Reviewer</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="owner">
                      <div className="flex items-center gap-2">
                        <Building className="w-4 h-4 text-blue-500" />
                        <span>Business Owner</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="admin">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-red-500" />
                        <span>Administrator</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Account Status</Label>
                <Select
                  value={newUserData.status}
                  onValueChange={(value) => handleInputChange("status", value)}
                >
                  <SelectTrigger><SelectValue placeholder="Select a status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="p-4 rounded-lg border">
                <p className="text-sm flex items-start gap-2">
                  <Info className="w-4 h-4 mt-[2px]" />
                  <span>
                    <strong>Notifications:</strong>{" "}
                    {sendEmail
                      ? "A welcome/approval email will be sent (when applicable)."
                      : "Email notifications are disabled for this action."}
                  </span>
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddDialog(false)}
                disabled={addingUser}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={addingUser || !isAdmin}>
                {addingUser ? "Creating User..." : (<><Plus className="w-4 h-4 mr-2" />Create User</>)}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View / Edit User Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="w-5 h-5" />
              {editingUser ? `Edit: ${editingUser.full_name || editingUser.email}` : "Edit User"}
            </DialogTitle>
          </DialogHeader>

          {editingUser && editForm && (
            <div className="space-y-5 py-2">
              {/* Read-only basics */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>User ID</Label>
                  <Input value={editingUser.id} disabled />
                </div>
                <div>
                  <Label>Date Joined</Label>
                  <Input
                    value={
                      getJoinedDate(editingUser)
                        ? format(new Date(getJoinedDate(editingUser)), "MMM d, yyyy")
                        : "—"
                    }
                    disabled
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Email (read-only)</Label>
                  <Input value={editForm.email} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Verified</Label>
                  <Input value={editForm.verified ? "Yes" : "No"} disabled />
                </div>
              </div>

              {/* Editable fields */}
              <div className="space-y-2">
                <Label htmlFor="edit_full_name">Full Name</Label>
                <Input
                  id="edit_full_name"
                  value={editForm.full_name}
                  onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))}
                  placeholder="Full name"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>User Type</Label>
                  <Select
                    value={editForm.user_type}
                    onValueChange={(v) => setEditForm((f) => ({ ...f, user_type: v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Choose type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reviewer">Reviewer</SelectItem>
                      <SelectItem value="owner">Business Owner</SelectItem>
                      <SelectItem value="admin">Administrator</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={editForm.status}
                    onValueChange={(v) => setEditForm((f) => ({ ...f, status: v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Choose status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Premium Membership</Label>
                    <Switch
                      checked={!!editForm.premium_membership}
                      onCheckedChange={(v) =>
                        setEditForm((f) => ({ ...f, premium_membership: !!v }))
                      }
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Toggle premium, then (optionally) set expiry.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Premium Expires (YYYY-MM-DD)</Label>
                  <Input
                    type="date"
                    value={editForm.premium_expires || ""}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, premium_expires: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Profile Image URL</Label>
                <Input
                  value={editForm.profile_image}
                  onChange={(e) => setEditForm((f) => ({ ...f, profile_image: e.target.value }))}
                  placeholder="https://…"
                />
              </div>

              <div className="space-y-2">
                <Label>Bio</Label>
                <textarea
                  value={editForm.bio}
                  onChange={(e) => setEditForm((f) => ({ ...f, bio: e.target.value }))}
                  rows={4}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="Short bio"
                />
              </div>

              <div className="p-4 rounded-lg border">
                <p className="text-sm flex items-start gap-2">
                  <Info className="w-4 h-4 mt-[2px]" />
                  <span>
                    <strong>Notifications:</strong>{" "}
                    {sendEmail
                      ? "If the status changed, an approval/suspension email will be sent."
                      : "Email notifications are disabled for this save."}
                  </span>
                </p>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowEditDialog(false)}
                  disabled={savingEdit}
                >
                  Close
                </Button>
                <Button onClick={saveEdit} disabled={savingEdit || !isAdmin}>
                  {savingEdit ? "Saving…" : "Save changes"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
