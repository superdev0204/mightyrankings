import React, { useState, useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Trash2, AlertCircle, CheckCircle, Pencil, Loader2,
} from "lucide-react";
import IconPicker from "@/components/IconPicker";
// ✅ Axios API imports
import { listCategories, createCategory, deleteCategory, updateCategory } from "@/api/categories";

/* ---------------------- color helpers ---------------------- */
const isValidHex6 = (v = "") => /^#?[0-9a-f]{6}$/i.test(v.trim());
const isValidHex3 = (v = "") => /^#?[0-9a-f]{3}$/i.test(v.trim());
const toHex6 = (v = "") => {
  const s = v.trim().replace(/^#/, "");
  if (isValidHex3(s)) {
    return `#${s.split("").map((c) => c + c).join("")}`.toLowerCase();
  }
  if (isValidHex6(s)) return `#${s}`.toLowerCase();
  return "";
};
const normalizeHex = (v = "") => toHex6(v) || "#000000";

/* --------------------- Color field UI --------------------- */
function ColorField({ id, value, onChange, label = "Color", placeholder = "#2563eb" }) {
  const colorRef = useRef(null);
  const swatchValue = toHex6(value);

  return (
    <div className="space-y-2">
      {label && (
        <label className="text-sm font-medium" htmlFor={id}>
          {label}
        </label>
      )}
      <div className="flex items-center gap-3">
        <input
          ref={colorRef}
          type="color"
          className="sr-only"
          aria-hidden="true"
          tabIndex={-1}
          value={normalizeHex(value)}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          onClick={() => colorRef.current?.click()}
          aria-label="Pick color"
          title="Pick color"
          className="h-9 w-9 rounded-md border"
          style={{ background: swatchValue || "transparent" }}
        />
        <Input
          id={id}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1"
        />
      </div>
    </div>
  );
}

/* --------------------- tree helpers --------------------- */
const getParentId = (cat) => {
  if (!cat) return null;
  if (typeof cat.parent === "number") return cat.parent;
  if (cat.parent && typeof cat.parent === "object") return cat.parent.id ?? null;
  if (typeof cat.parent_id === "number") return cat.parent_id;
  return null;
};

const fullLabel = (cat) =>
  (cat?.full_slug ? cat.full_slug.replaceAll("/", " / ") : cat?.name || "-");

const buildChildrenMap = (cats) => {
  const map = new Map();
  for (const c of cats) map.set(c.id, []);
  for (const c of cats) {
    const p = getParentId(c);
    if (p != null && map.has(p)) map.get(p).push(c.id);
  }
  return map;
};

const getDescendants = (id, childrenMap) => {
  const res = new Set();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop();
    const kids = childrenMap.get(cur) || [];
    for (const k of kids) {
      if (!res.has(k)) {
        res.add(k);
        stack.push(k);
      }
    }
  }
  return res;
};

export default function AdminManageCategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // messages
  const [message, setMessage] = useState({ type: "", text: "" });

  // create form
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryDesc, setNewCategoryDesc] = useState("");
  const [newCategoryIcon, setNewCategoryIcon] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState("");
  const [newCategoryParent, setNewCategoryParent] = useState(""); // NEW

  // edit dialog state
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    icon: "",
    color: "",
    parent: "", // NEW
  });

  useEffect(() => {
    fetchCategories();
  }, []);

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: "", text: "" }), 4000);
  };

  const fetchCategories = async () => {
    setLoading(true);
    try {
      // Prefer server ordering that groups siblings close; fall back to name
      const items = await listCategories({ ordering: "name" });
      setCategories(items || []);
    } catch (error) {
      console.error("Failed to fetch categories:", error);
      showMessage("error", "Failed to fetch categories.");
    } finally {
      setLoading(false);
    }
  };

  /* ----------------- derived maps ----------------- */
  const childrenMap = useMemo(() => buildChildrenMap(categories), [categories]);

  const sortedCategories = useMemo(() => {
    const list = [...categories];
    list.sort((a, b) => fullLabel(a).localeCompare(fullLabel(b)));
    return list;
  }, [categories]);

  /* ----------------- create ----------------- */
  const handleCreateCategory = async (e) => {
    e.preventDefault();
    const name = newCategoryName.trim();
    if (!name) return;
    try {
      const payload = {
        name,
        description: newCategoryDesc.trim() || undefined,
        icon: newCategoryIcon.trim() || undefined,
        color: toHex6(newCategoryColor) || undefined,
      };
      if (newCategoryParent) payload.parent = Number(newCategoryParent);
      await createCategory(payload);
      setNewCategoryName("");
      setNewCategoryDesc("");
      setNewCategoryIcon("");
      setNewCategoryColor("");
      setNewCategoryParent("");
      await fetchCategories();
      showMessage("success", `Category "${name}" created.`);
    } catch (error) {
      console.error("Failed to create category:", error);
      const apiErr =
        error?.response?.data &&
        (error.response.data.detail ||
          Object.values(error.response.data).flat().join(" "));
      showMessage("error", apiErr || "Failed to create category.");
    }
  };

  const handleDeleteCategory = async (category) => {
    if (!window.confirm(`Delete category "${category.name}"?`)) return;
    if (typeof category.business_count === "number" && category.business_count > 0) {
      showMessage("error", "Cannot delete a category that has businesses.");
      return;
    }
    try {
      await deleteCategory(category.id);
      await fetchCategories();
      showMessage("success", `Category "${category.name}" deleted.`);
    } catch (error) {
      console.error("Failed to delete category:", error);
      const apiErr =
        error?.response?.data &&
        (error.response.data.detail ||
          Object.values(error.response.data).flat().join(" "));
      showMessage("error", apiErr || "Failed to delete category. It may be in use.");
    }
  };

  /* ----------------- edit ----------------- */
  const openEdit = (cat) => {
    setEditTarget(cat);
    setEditForm({
      name: cat.name || "",
      description: cat.description || "",
      icon: cat.icon || "",
      color: cat.color || "",
      parent: getParentId(cat) ? String(getParentId(cat)) : "",
    });
    setShowEditDialog(true);
  };

  const handleEditChange = (field, value) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editTarget) return;
    const name = editForm.name.trim();
    if (!name) {
      showMessage("error", "Name is required.");
      return;
    }

    // Prevent choosing self or a descendant as parent
    const disallowed = new Set([editTarget.id, ...getDescendants(editTarget.id, childrenMap)]);
    if (editForm.parent && disallowed.has(Number(editForm.parent))) {
      showMessage("error", "Invalid parent: cannot set to itself or a descendant.");
      return;
    }

    setEditSaving(true);
    try {
      const payload = {
        name,
        description: editForm.description?.trim() || "",
        icon: editForm.icon?.trim() || "",
        color: toHex6(editForm.color) || "",
        parent: editForm.parent ? Number(editForm.parent) : null,
      };
      await updateCategory(editTarget.id, payload);
      setShowEditDialog(false);
      setEditTarget(null);
      await fetchCategories();
      showMessage("success", `Category "${name}" updated.`);
    } catch (error) {
      console.error("Failed to update category:", error);
      const apiErr =
        error?.response?.data &&
        (error.response.data.detail ||
          Object.values(error.response.data).flat().join(" "));
      showMessage("error", apiErr || "Failed to update category.");
    } finally {
      setEditSaving(false);
    }
  };

  /* ----------------- parent options ----------------- */
  const parentOptionsForCreate = sortedCategories; // all categories OK for create
  const parentOptionsForEdit = useMemo(() => {
    if (!editTarget) return [];
    const blocked = new Set([editTarget.id, ...getDescendants(editTarget.id, childrenMap)]);
    return sortedCategories.filter((c) => !blocked.has(c.id));
  }, [sortedCategories, editTarget, childrenMap]);

  return (
    <div className="p-4 md:p-8 grid gap-8 md:grid-cols-3">
      <div className="md:col-span-2">
        <h1 className="text-3xl font-bold mb-6">Manage Categories</h1>

        {message.text && (
          <Alert variant={message.type === "error" ? "destructive" : "default"} className="mb-4">
            {message.type === "success" ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader><CardTitle>Existing Categories</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name / Path</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Icon</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead>Businesses</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan="6">Loading...</TableCell></TableRow>
                ) : categories.length === 0 ? (
                  <TableRow><TableCell colSpan="6">No categories yet.</TableCell></TableRow>
                ) : (
                  sortedCategories.map((category) => (
                    <TableRow key={category.id}>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span>{category.name}</span>
                          <span className="text-xs text-muted-foreground">{fullLabel(category)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[280px] truncate">{category.description || "—"}</TableCell>
                      <TableCell>{category.icon || "—"}</TableCell>
                      <TableCell>
                        {category.color ? (
                          <span className="inline-flex items-center gap-2">
                            <span
                              className="inline-block h-3 w-3 rounded-full border"
                              style={{ background: toHex6(category.color) || "transparent" }}
                            />
                            <span className="text-sm text-muted-foreground">{toHex6(category.color)}</span>
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        {typeof category.business_count === "number" ? category.business_count : "—"}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button variant="secondary" size="sm" onClick={() => openEdit(category)}>
                          <Pencil className="h-4 w-4 mr-1" /> Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="icon"
                          onClick={() => handleDeleteCategory(category)}
                          title={
                            category.business_count > 0
                              ? "This category has businesses and cannot be deleted."
                              : "Delete category"
                          }
                          disabled={typeof category.business_count === "number" && category.business_count > 0}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Create Category */}
      <div>
        <Card>
          <CardHeader><CardTitle>Add New Category</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleCreateCategory} className="space-y-4">
              <Input
                placeholder="New category name"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                required
              />
              <Input
                placeholder="Description (optional)"
                value={newCategoryDesc}
                onChange={(e) => setNewCategoryDesc(e.target.value)}
              />

              <IconPicker
                value={newCategoryIcon}
                onChange={setNewCategoryIcon}
                label="Icon (optional)"
              />

              <ColorField
                id="new-category-color"
                value={newCategoryColor}
                onChange={setNewCategoryColor}
                label="Color (optional)"
              />

              {/* Parent selection (optional) */}
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="new-parent">Parent (optional)</label>
                <select
                  id="new-parent"
                  className="h-10 w-full rounded-md border px-3 text-sm"
                  value={newCategoryParent}
                  onChange={(e) => setNewCategoryParent(e.target.value)}
                >
                  <option value="">None (top-level)</option>
                  <option disabled>──────────</option>
                  {parentOptionsForCreate.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {fullLabel(c)}
                    </option>
                  ))}
                </select>
              </div>

              <Button type="submit" className="w-full">Create Category</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Edit Category Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Edit Category</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="cat-name">Name *</label>
              <Input
                id="cat-name"
                value={editForm.name}
                onChange={(e) => handleEditChange("name", e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="cat-desc">Description</label>
              <Input
                id="cat-desc"
                value={editForm.description}
                onChange={(e) => handleEditChange("description", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <IconPicker
                value={editForm.icon}
                onChange={(v) => handleEditChange("icon", v)}
                label="Icon"
              />
            </div>

            <ColorField
              id="cat-color"
              value={editForm.color}
              onChange={(v) => handleEditChange("color", v)}
              label="Color"
            />

            {/* Parent (cannot be self or descendant) */}
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="cat-parent">Parent</label>
              <select
                id="cat-parent"
                className="h-10 w-full rounded-md border px-3 text-sm"
                value={editForm.parent}
                onChange={(e) => handleEditChange("parent", e.target.value)}
              >
                <option value="">None (top-level)</option>
                <option disabled>──────────</option>
                {parentOptionsForEdit.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {fullLabel(c)}
                  </option>
                ))}
              </select>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowEditDialog(false)} disabled={editSaving}>
                Cancel
              </Button>
              <Button type="submit" disabled={editSaving}>
                {editSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editSaving ? "Saving…" : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
