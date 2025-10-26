import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Check, X, Plus, Building, AlertCircle, CheckCircle, Loader2, Pencil, Crown,
  UserCheck, UserX, FolderSymlink, Stethoscope
} from "lucide-react";
import { format } from "date-fns";
import { Switch } from "@/components/ui/switch";

// Business APIs
import {
  listBusinessesPaged,
  updateBusiness,
  createBusiness,
  approveBusinessClaim,
  rejectBusinessClaim,
  setBusinessOwner,
  bulkSetCategory as bulkSetBusinessCategory,
} from "@/api/businesses";

// Doctor APIs
import {
  listDoctorsPaged,
  updateDoctor,
  createDoctor,
  approveDoctorClaim,
  rejectDoctorClaim,
  setDoctorOwner,
  bulkSetDoctorCategory,
} from "@/api/doctors";

// Categories + Users
import { listAllCategories } from "@/api/categories";
import { listUsers } from "@/api/users";

/* ----------------- helpers ----------------- */
const fullLabel = (cat) =>
  (cat?.full_slug ? cat.full_slug.replaceAll("/", " / ") : cat?.name || "-");

const categoryById = (categories, id) => categories.find((c) => c.id === Number(id));

const rootSegmentOf = (cat) => {
  const fs = (cat?.full_slug || "").trim();
  return fs.split("/")[0] || "";
};

const STATUS_BADGE = {
  pending: "secondary",
  active: "default",
  suspended: "destructive",
};

const ENTITY = {
  BUSINESS: "business",
  DOCTOR: "doctor",
};

const TYPE_ICON = {
  [ENTITY.BUSINESS]: <Building className="w-4 h-4" />,
  [ENTITY.DOCTOR]: <Stethoscope className="w-4 h-4" />,
};

/** Heuristics to detect whether a category is a Doctor/Provider vertical (matches Addbusinesses.jsx). */
const isDoctorCategory = (cat) => {
  if (!cat) return false;
  const s = `${cat.full_slug || ""} ${cat.name || ""}`.toLowerCase();
  const doctorish = [
    "doctor",
    "physician",
    "provider",
    "dentist",
    "dermatologist",
    "cardiologist",
    "pediatrician",
    "primary-care",
    "primary care",
    "health",
    "medical",
  ];
  return doctorish.some((t) => s.includes(t));
};

export default function AdminManageBusinessesPage() {
  const [items, setItems] = useState([]); // unified rows: { entity, ...record }
  const [total, setTotal] = useState(0);

  const [categories, setCategories] = useState([]);
  const [users, setUsers] = useState([]);

  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending"); // pending | active | suspended | all

  // pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // filters
  const [nameSearch, setNameSearch] = useState("");
  const [categoryFilterId, setCategoryFilterId] = useState(""); // "" = All categories

  // dialogs
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [adding, setAdding] = useState(false);

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editTarget, setEditTarget] = useState(null); // unified row

  const [message, setMessage] = useState({ type: "", text: "" });
  const [sendEmail, setSendEmail] = useState(true);

  // bulk move
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [showBulkMove, setShowBulkMove] = useState(false);
  const [bulkMoveCategoryId, setBulkMoveCategoryId] = useState("");
  const [moving, setMoving] = useState(false);

  /* ---------- API accessors ---------- */
  const API = {
    [ENTITY.BUSINESS]: {
      listPaged: listBusinessesPaged,
      create: createBusiness,
      update: updateBusiness,
      approveClaim: approveBusinessClaim,
      rejectClaim: rejectBusinessClaim,
      setOwner: setBusinessOwner,
      bulkSetCategory: bulkSetBusinessCategory,
      identityLabel: "Business",
      icon: <Building className="w-5 h-5" />,
      getName: (b) => b.name || "",
      getCity: (b) => b.city || "—",
      getState: (b) => b.state || "—",
      getStatus: (b) => b.status,
      getCategoryId: (b) => b.category_id,
      hasPendingClaim: (b) => !!b.pending_claim_by_id,
      ownerUserId: (b) => b.claimed_by_id,
      pendingUserId: (b) => b.pending_claim_by_id,
      createdDate: (b) => b.created_at || b.created_date || b.created || b.createdOn,
      premiumFlag: (b) => !!b.is_premium,
    },
    [ENTITY.DOCTOR]: {
      listPaged: listDoctorsPaged,
      create: createDoctor,
      update: updateDoctor,
      approveClaim: approveDoctorClaim,
      rejectClaim: rejectDoctorClaim,
      setOwner: setDoctorOwner,
      bulkSetCategory: bulkSetDoctorCategory,
      identityLabel: "Doctor",
      icon: <Stethoscope className="w-5 h-5" />,
      getName: (d) => d.provider_name || "",
      getCity: (d) => d.city || "—",
      getState: (d) => d.state || "—",
      getStatus: (d) => d.status,
      getCategoryId: (d) => d.category_id,
      hasPendingClaim: (d) => !!d.pending_claim_by_id,
      ownerUserId: (d) => d.claimed_by_id,
      pendingUserId: (d) => d.pending_claim_by_id,
      createdDate: (d) => d.created_at || d.created_date || d.created || d.createdOn,
      premiumFlag: (d) => !!d.is_premium,
    },
  };

  /* ---------- initial loads ---------- */
  useEffect(() => {
    (async () => {
      try {
        const [allCategories, allUsers] = await Promise.all([
          listAllCategories({ ordering: "name" }),
          listUsers().catch(() => []),
        ]);
        setCategories(allCategories || []);
        setUsers(Array.isArray(allUsers) ? allUsers : []);
      } catch (e) {
        console.error("Failed loading categories/users:", e);
      }
    })();
  }, []);

  // refresh categories when dialogs open
  useEffect(() => {
    if (!showAddDialog) return;
    (async () => {
      try {
        const all = await listAllCategories({ ordering: "name" });
        setCategories(all || []);
      } catch (e) {
        console.error("Refresh categories (add) failed:", e);
      }
    })();
  }, [showAddDialog]);

  useEffect(() => {
    if (!showBulkMove) return;
    (async () => {
      try {
        const all = await listAllCategories({ ordering: "name" });
        setCategories(all || []);
      } catch (e) {
        console.error("Refresh categories (bulk move) failed:", e);
      }
    })();
  }, [showBulkMove]);

  /* ---------- helpers ---------- */
  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: "", text: "" }), 5000);
  };

  // users lookup
  const usersById = useMemo(() => {
    const m = new Map();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);

  const usersByEmailLower = useMemo(() => {
    const m = new Map();
    for (const u of users) {
      const em = (u.email || "").trim().toLowerCase();
      if (em) m.set(em, u);
    }
    return m;
  }, [users]);

  const emailForUserId = (id) => (id ? usersById.get(Number(id))?.email || "" : "");

  const keyOf = (row) => `${row.entity}:${row.id}`;

  /* ---------- listing ---------- */
  useEffect(() => {
    loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, page, pageSize, nameSearch, categoryFilterId]);

  const baseQueryParams = () => {
    const params = { ordering: "-updated_at" };
    if (filter !== "all") params.status = filter;
    if (nameSearch.trim()) params.search = nameSearch.trim();

    // IMPORTANT: only send category_id
    if (categoryFilterId) {
      const cid = Number(categoryFilterId);
      if (!Number.isNaN(cid)) {
        params.category_id = cid;
      }
    }
    return params;
  };

  const loadPage = async () => {
    setLoading(true);
    try {
      const upto = page * pageSize;
      const params = baseQueryParams();

      const [bizRes, docRes] = await Promise.all([
        API[ENTITY.BUSINESS].listPaged({ ...params, limit: upto, offset: 0 }),
        API[ENTITY.DOCTOR].listPaged({ ...params, limit: upto, offset: 0 }),
      ]);

      const bizItems = (bizRes?.items || []).map((b) => ({ entity: ENTITY.BUSINESS, ...b }));
      const docItems = (docRes?.items || []).map((d) => ({ entity: ENTITY.DOCTOR, ...d }));

      const pickDate = (r) =>
        new Date(
          r.updated_at || r.updated || r.updatedOn || r.created_at || r.created || r.createdOn || 0
        ).getTime();

      const merged = [...bizItems, ...docItems].sort((a, b) => pickDate(b) - pickDate(a));
      const start = (page - 1) * pageSize;
      const slice = merged.slice(start, start + pageSize);

      setItems(slice);
      setTotal(Number(bizRes?.count || 0) + Number(docRes?.count || 0));
      setSelectedKeys(new Set());
    } catch (error) {
      console.error("Failed to load items:", error);
      setItems([]);
      setTotal(0);
      showMessage("error", `Failed to load listings.`);
    } finally {
      setLoading(false);
    }
  };

  /* ---------- per-row helpers (entity-aware) ---------- */
  const getAPI = (row) => API[row?.entity || ENTITY.BUSINESS];
  const rowName = (row) => getAPI(row).getName(row);
  const rowCity = (row) => getAPI(row).getCity(row);
  const rowState = (row) => getAPI(row).getState(row);
  const rowStatus = (row) => getAPI(row).getStatus(row);
  const rowCategoryId = (row) => getAPI(row).getCategoryId(row);
  const rowHasPendingClaim = (row) => getAPI(row).hasPendingClaim(row);
  const rowOwnerId = (row) => getAPI(row).ownerUserId(row);
  const rowPendingUserId = (row) => getAPI(row).pendingUserId(row);
  const rowCreatedDate = (row) => getAPI(row).createdDate(row);
  const rowPremium = (row) => getAPI(row).premiumFlag(row);

  const renderCategory = (row) => {
    const catObj = categories.find((c) => c.id === Number(rowCategoryId(row)));
    if (catObj) return fullLabel(catObj);
    if (typeof row.category_name === "string") return row.category_name;
    return "-";
  };

  /* ---------- status ---------- */
  const handleUpdateStatus = async (row, newStatus) => {
    try {
      await getAPI(row).update(row.id, { status: newStatus }, { notify: sendEmail });
      await loadPage();
      showMessage("success", `${getAPI(row).identityLabel} "${rowName(row)}" set to ${newStatus}.`);
    } catch (error) {
      console.error("Failed to update status:", error);
      showMessage("error", "Failed to update status.");
    }
  };

  /* ---------- Add (per entity, inferred by category) ---------- */
  const emptyBusiness = {
    name: "",
    license: "",
    category_id: "",
    email: "",
    works_for_url: "", // URL (link)
    street_address: "",
    city: "",
    state: "",
    zip: "",
    description: "",
    practice_areas: "",
    honors: "",
    work_experience: "",
    associations: "",
    education: "",
    speaking_engagements: "",
    publications: "",
    language: "",
    website: "",
    phone: "",
    image_url: "",
    status: "pending",
    is_premium: false,
  };

  const emptyDoctor = {
    provider_name: "",
    specialty: "",
    category_id: "",
    email: "",
    works_for_url: "", // URL (link)
    street_address: "",
    city: "",
    state: "",
    zip: "",
    description: "",
    insurances: "",
    popular_visit_reasons: "",
    practice_names: "",
    educations: "",
    languages: "",
    gender: "",
    npi_number: "",
    website: "",
    phone: "",
    image_url: "",
    status: "pending",
    is_premium: false,
  };

  // Add dialog form state (we keep two shapes but choose by category)
  const [newBusiness, setNewBusiness] = useState(emptyBusiness);
  const [newDoctor, setNewDoctor] = useState(emptyDoctor);

  // Which form to show? Use selected category in whichever form currently has a category chosen.
  const addSelectedCategoryId = newBusiness.category_id || newDoctor.category_id || "";
  const addSelectedCategory = useMemo(
    () => categoryById(categories, Number(addSelectedCategoryId)),
    [categories, addSelectedCategoryId]
  );
  const addIsDoctor = useMemo(() => isDoctorCategory(addSelectedCategory), [addSelectedCategory]);

  const handleNewInputChange = (formSetter) => (field, value) => {
    formSetter((prev) => ({ ...prev, [field]: value }));
  };

  const resetAddForms = () => {
    setNewBusiness(emptyBusiness);
    setNewDoctor(emptyDoctor);
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    const isDoctor = addIsDoctor;

    // Basic validation per type
    if (isDoctor) {
      if (!newDoctor.provider_name || !newDoctor.category_id) {
        showMessage("error", "Provider Name and Category are required.");
        return;
      }
    } else {
      if (!newBusiness.name || !newBusiness.category_id) {
        showMessage("error", "Business Name and Category are required.");
        return;
      }
    }

    setAdding(true);
    try {
      if (isDoctor) {
        const payload = {
          ...newDoctor,
          category_id: Number(newDoctor.category_id) || null,
          works_for_url: newDoctor.works_for_url?.trim() || "",
        };
        await API[ENTITY.DOCTOR].create(payload, { notify: sendEmail });
      } else {
        const payload = {
          ...newBusiness,
          category_id: Number(newBusiness.category_id) || null,
          works_for_url: newBusiness.works_for_url?.trim() || "",
        };
        await API[ENTITY.BUSINESS].create(payload, { notify: sendEmail });
      }

      setShowAddDialog(false);
      resetAddForms();
      showMessage("success", `${isDoctor ? "Doctor" : "Business"} has been created.`);
      setPage(1);
      await loadPage();
    } catch (error) {
      console.error("Failed to create:", error);
      const apiErr =
        error?.response?.data &&
        (error.response.data.detail ||
          Object.values(error.response.data).flat().join(" "));
      showMessage("error", apiErr || "Failed to create. Please try again.");
    } finally {
      setAdding(false);
    }
  };

  /* ---------- Edit (per entity) ---------- */
  const [editData, setEditData] = useState(emptyBusiness);

  const openEditDialog = (row) => {
    setEditTarget(row);
    if (row.entity === ENTITY.DOCTOR) {
      setEditData({
        provider_name: row.provider_name || "",
        specialty: row.specialty || "",
        category_id: row.category_id ? String(row.category_id) : "",
        email: row.email || "",
        works_for_url: row.works_for_url || "",
        street_address: row.street_address || "",
        city: row.city || "",
        state: row.state || "",
        zip: row.zip || "",
        description: row.description || "",
        insurances: row.insurances || "",
        popular_visit_reasons: row.popular_visit_reasons || "",
        practice_names: row.practice_names || "",
        educations: row.educations || "",
        languages: row.languages || "",
        gender: row.gender || "",
        npi_number: row.npi_number || "",
        website: row.website || "",
        phone: row.phone || "",
        image_url: row.image_url || "",
        status: row.status || "pending",
        is_premium: Boolean(row.is_premium),
      });
    } else {
      setEditData({
        name: row.name || "",
        license: row.license || "",
        category_id: row.category_id ? String(row.category_id) : "",
        email: row.email || "",
        works_for_url: row.works_for_url || "",
        street_address: row.street_address || "",
        city: row.city || "",
        state: row.state || "",
        zip: row.zip || "",
        description: row.description || "",
        practice_areas: row.practice_areas || "",
        honors: row.honors || "",
        work_experience: row.work_experience || "",
        associations: row.associations || "",
        education: row.education || "",
        speaking_engagements: row.speaking_engagements || "",
        publications: row.publications || "",
        language: row.language || "",
        website: row.website || "",
        phone: row.phone || "",
        image_url: row.image_url || "",
        status: row.status || "pending",
        is_premium: Boolean(row.is_premium),
      });
    }
    setShowEditDialog(true);
  };

  const handleEditChange = (field, value) => {
    setEditData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editTarget) return;

    if (editTarget.entity === ENTITY.DOCTOR) {
      if (!editData.provider_name || !editData.category_id) {
        showMessage("error", "Provider Name and Category are required.");
        return;
      }
    } else {
      if (!editData.name || !editData.category_id) {
        showMessage("error", "Name and Category are required.");
        return;
      }
    }

    setSavingEdit(true);
    try {
      const payload = {
        ...editData,
        category_id: Number(editData.category_id) || null,
        works_for_url: editData.works_for_url?.trim() || "",
      };
      await getAPI(editTarget).update(editTarget.id, payload, { notify: sendEmail });
      setShowEditDialog(false);
      setEditTarget(null);
      showMessage("success", `${getAPI(editTarget).identityLabel} updated.`);
      await loadPage();
    } catch (error) {
      console.error("Failed to update:", error);
      const apiErr =
        error?.response?.data &&
        (error.response.data.detail ||
          Object.values(error.response.data).flat().join(" "));
      showMessage("error", apiErr || "Failed to update. Please try again.");
    } finally {
      setSavingEdit(false);
    }
  };

  /* ---------- Claims ---------- */
  const handleApproveClaim = async (row) => {
    try {
      await getAPI(row).approveClaim(row.id);
      await loadPage();
      showMessage("success", `Approved claim for "${rowName(row)}".`);
    } catch (error) {
      console.error("approve claim failed:", error);
      showMessage("error", "Failed to approve claim.");
    }
  };

  const handleRejectClaim = async (row) => {
    try {
      await getAPI(row).rejectClaim(row.id);
      await loadPage();
      showMessage("success", `Rejected claim for "${rowName(row)}".`);
    } catch (error) {
      console.error("reject claim failed:", error);
      showMessage("error", "Failed to reject claim.");
    }
  };

  /* ---------- Owner ---------- */
  const handleChangeOwner = async (row) => {
    const currentEmail = emailForUserId(rowOwnerId(row));
    const input = window.prompt(`Enter owner's email (leave blank to clear):`, currentEmail || "");
    if (input === null) return;

    const email = (input || "").trim();
    let newUserId = null;

    if (email.length) {
      const key = email.toLowerCase();
      const user = usersByEmailLower.get(key);
      if (!user) {
        showMessage("error", `No user found with email "${email}".`);
        return;
      }
      newUserId = user.id;
    }

    try {
      await getAPI(row).setOwner(row.id, newUserId);
      await loadPage();
      showMessage("success", newUserId ? "Owner updated." : "Owner cleared.");
    } catch (error) {
      console.error("set owner failed:", error);
      const msg = error?.response?.data?.detail || "Failed to set owner.";
      showMessage("error", msg);
    }
  };

  /* ---------- selection / bulk ---------- */
  const toggleOne = (key) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectedRows = useMemo(
    () => items.filter((r) => selectedKeys.has(keyOf(r))),
    [items, selectedKeys]
  );

  const selectedRootSegment = useMemo(() => {
    if (selectedKeys.size === 0) return "";
    const roots = new Set();
    for (const r of selectedRows) {
      const cat = categoryById(categories, getAPI(r).getCategoryId(r));
      if (!cat) continue;
      roots.add(rootSegmentOf(cat));
    }
    return roots.size === 1 ? [...roots][0] : "";
  }, [selectedRows, categories]);

  const bulkDestOptions = useMemo(() => {
    if (!selectedRootSegment) return [];
    return [...categories]
      .filter((c) => (c.full_slug || "").startsWith(selectedRootSegment + "/"))
      .sort((a, b) => fullLabel(a).localeCompare(fullLabel(b)));
  }, [categories, selectedRootSegment]);

  const openBulkMove = () => {
    if (!selectedKeys.size) return;
    if (!selectedRootSegment) {
      showMessage("error", "Selected listings span different main categories. Refine your selection.");
      return;
    }
    setBulkMoveCategoryId("");
    setShowBulkMove(true);
  };

  const performBulkMove = async (e) => {
    e?.preventDefault?.();
    if (!bulkDestOptions.length || !bulkMoveCategoryId || selectedKeys.size === 0) return;

    // Call per table
    const byType = { [ENTITY.BUSINESS]: [], [ENTITY.DOCTOR]: [] };
    for (const r of selectedRows) {
      byType[r.entity].push(r.id);
    }

    setMoving(true);
    try {
      const tasks = [];
      if (byType[ENTITY.BUSINESS].length) {
        tasks.push(API[ENTITY.BUSINESS].bulkSetCategory({
          ids: byType[ENTITY.BUSINESS],
          to_category_id: Number(bulkMoveCategoryId),
        }));
      }
      if (byType[ENTITY.DOCTOR].length) {
        tasks.push(API[ENTITY.DOCTOR].bulkSetCategory({
          ids: byType[ENTITY.DOCTOR],
          to_category_id: Number(bulkMoveCategoryId),
        }));
      }
      await Promise.all(tasks);

      setShowBulkMove(false);
      setSelectedKeys(new Set());
      await loadPage();
      showMessage("success", "Listings moved successfully.");
    } catch (err) {
      console.error("bulk move failed:", err);
      const apiErr =
        err?.response?.data &&
        (err.response.data.detail ||
          Object.values(err.response.data).flat().join(" "));
      showMessage("error", apiErr || "Failed to move listings.");
    } finally {
      setMoving(false);
    }
  };

  /* ---------- columns ---------- */
  const showSpecialty = items.some((r) => r.entity === ENTITY.DOCTOR);
  const columnCount = useMemo(() => {
    // checkbox + Name + (Specialty?) + Category + City + State + Status + Owner + Pending + Created + Actions
    return 10 + (showSpecialty ? 1 : 0);
  }, [showSpecialty]);

  /* ---------- pager ---------- */
  const totalPagesDisplay = Math.max(1, Math.ceil(total / pageSize));
  const Pager = () => (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
      <div className="text-sm text-gray-600">
        {total > 0 ? (
          <>
            Showing{" "}
            <strong>
              {Math.min((page - 1) * pageSize + 1, total)}–{Math.min(page * pageSize, total)}
            </strong>{" "}
            of <strong>{total}</strong> listings
          </>
        ) : (
          "No results"
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!(page > 1)}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Prev
        </Button>
        {Array.from({ length: Math.min(7, totalPagesDisplay) }, (_, i) => {
          const half = 3;
          let start = Math.max(1, page - half);
          let end = Math.min(totalPagesDisplay, start + 6);
          start = Math.max(1, end - 6);
          const n = start + i;
          if (n > totalPagesDisplay) return null;
          const active = n === page;
          return (
            <Button key={n} variant={active ? "default" : "outline"} size="sm" onClick={() => setPage(n)}>
              {n}
            </Button>
          );
        })}
        <Button
          variant="outline"
          size="sm"
          disabled={!(page < totalPagesDisplay)}
          onClick={() => setPage((p) => Math.min(totalPagesDisplay, p + 1))}
        >
          Next
        </Button>
        <select
          className="ml-2 h-9 rounded-md border px-2 text-sm"
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value));
            setPage(1);
          }}
        >
          {[20, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n}/page
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  /* ---------- UI ---------- */
  return (
    <div className="p-4 md:p-8">
      {/* Header + filters */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Building className="w-5 h-5" />
          Manage Businesses
        </h1>

        <div className="flex flex-wrap items-center gap-3">
          {/* Category filter */}
          <Select
            value={categoryFilterId || "__ALL__"}
            onValueChange={(v) => {
              setCategoryFilterId(v === "__ALL__" ? "" : v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__ALL__">All categories</SelectItem>
              {[...categories]
                .sort((a, b) => fullLabel(a).localeCompare(fullLabel(b)))
                .map((cat) => (
                  <SelectItem key={cat.id} value={String(cat.id)}>
                    {fullLabel(cat)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>

          {/* name search */}
          <Input
            placeholder="Search by name…"
            value={nameSearch}
            onChange={(e) => {
              setNameSearch(e.target.value);
              setPage(1);
            }}
            className="w-56"
          />

          <div className="flex items-center gap-2">
            <Switch id="send-email" checked={sendEmail} onCheckedChange={setSendEmail} />
            <Label htmlFor="send-email">Send email notification</Label>
          </div>

          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Listing
          </Button>
        </div>
      </div>

      {message.text && (
        <Alert
          variant={message.type === "error" ? "destructive" : "default"}
          className="mb-4"
        >
          {message.type === "success" ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      <Tabs value={filter} onValueChange={(val) => { setFilter(val); setPage(1); }}>
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="suspended">Suspended</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
        <TabsContent value={filter} />
      </Tabs>

      {/* Bulk selection toolbar */}
      <div className="flex items-center justify-between my-3">
        <div className="text-sm text-muted-foreground">
          {selectedKeys.size > 0 ? `${selectedKeys.size} selected` : "—"}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={selectedKeys.size === 0 || !selectedRootSegment}
            onClick={openBulkMove}
            title={
              selectedKeys.size === 0
                ? "Select listings to move"
                : !selectedRootSegment
                ? "Selection spans multiple main categories"
                : "Move to a subcategory under the same main"
            }
          >
            <FolderSymlink className="w-4 h-4 mr-2" />
            Move to Category ({selectedKeys.size})
          </Button>
        </div>
      </div>

      <div className="mt-2 rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[44px]">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={items.length > 0 && items.every((r) => selectedKeys.has(keyOf(r)))}
                  onChange={() => {
                    setSelectedKeys((prev) => {
                      const allSelected = items.every((r) => prev.has(keyOf(r)));
                      if (allSelected) return new Set();
                      return new Set(items.map(keyOf));
                    });
                  }}
                />
              </TableHead>
              <TableHead>Name</TableHead>
              {showSpecialty && <TableHead>Specialty</TableHead>}
              <TableHead>Category</TableHead>
              <TableHead>City</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Pending Claim</TableHead>
              <TableHead>Created On</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={columnCount} className="text-center">
                  Loading...
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columnCount} className="text-center">
                  No listings found for this filter.
                </TableCell>
              </TableRow>
            ) : (
              items.map((row) => {
                const key = keyOf(row);
                const ownerEmail = emailForUserId(rowOwnerId(row));
                const pendingEmail = emailForUserId(rowPendingUserId(row));

                return (
                  <TableRow key={key}>
                    <TableCell>
                      <input
                        type="checkbox"
                        aria-label={`Select ${rowName(row)}`}
                        checked={selectedKeys.has(key)}
                        onChange={() => toggleOne(key)}
                      />
                    </TableCell>

                    <TableCell className="font-medium flex items-center gap-2">
                      {/* small icon to hint type */}
                      <span className="opacity-70">{TYPE_ICON[row.entity]}</span>
                      {rowPremium(row) && (
                        <Badge className="bg-gradient-to-r from-yellow-400 to-orange-400 text-black">
                          <Crown className="w-3 h-3 mr-1" /> Premium
                        </Badge>
                      )}
                      <span>{rowName(row)}</span>
                    </TableCell>

                    {showSpecialty && (
                      <TableCell>{row.entity === ENTITY.DOCTOR ? (row.specialty || "—") : "—"}</TableCell>
                    )}

                    <TableCell>{renderCategory(row)}</TableCell>
                    <TableCell>{rowCity(row)}</TableCell>
                    <TableCell>{rowState(row)}</TableCell>

                    <TableCell>
                      <Badge variant={STATUS_BADGE[rowStatus(row)] || "secondary"}>
                        {rowStatus(row)}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      {rowOwnerId(row) ? (
                        <div className="inline-flex items-center gap-2">
                          <UserCheck className="w-4 h-4 text-green-600" />
                          <span className="font-mono text-sm">
                            {ownerEmail || `User #${rowOwnerId(row)}`}
                          </span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1 text-muted-foreground">
                          <UserX className="w-4 h-4" /> —
                        </div>
                      )}
                    </TableCell>

                    <TableCell>
                      {rowHasPendingClaim(row) ? (
                        <Badge variant="secondary" className="font-mono">
                          {pendingEmail || `User #${rowPendingUserId(row)}`}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>

                    <TableCell>
                      {rowCreatedDate(row)
                        ? format(new Date(rowCreatedDate(row)), "MMM d, yyyy")
                        : "-"}
                    </TableCell>

                    <TableCell className="text-right space-x-2 whitespace-nowrap">
                      <Button variant="secondary" size="sm" onClick={() => openEditDialog(row)}>
                        <Pencil className="w-4 h-4 mr-2" /> Edit
                      </Button>

                      {rowHasPendingClaim(row) && (
                        <>
                          <Button size="sm" onClick={() => handleApproveClaim(row)}>
                            <Check className="w-4 h-4 mr-2" /> Approve Claim
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleRejectClaim(row)}>
                            <X className="w-4 h-4 mr-2" /> Reject
                          </Button>
                        </>
                      )}

                      <Button variant="outline" size="sm" onClick={() => handleChangeOwner(row)}>
                        <UserCheck className="w-4 h-4 mr-2" /> Change Owner
                      </Button>

                      {rowStatus(row) === "pending" && (
                        <Button size="sm" onClick={() => handleUpdateStatus(row, "active")}>
                          <Check className="w-4 h-4 mr-2" /> Approve
                        </Button>
                      )}
                      {rowStatus(row) === "active" && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleUpdateStatus(row, "suspended")}
                        >
                          <X className="w-4 h-4 mr-2" /> Suspend
                        </Button>
                      )}
                      {rowStatus(row) === "suspended" && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleUpdateStatus(row, "active")}
                        >
                          <Check className="w-4 h-4 mr-2" /> Reactivate
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

      <Pager />

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(o) => { setShowAddDialog(o); if (!o) resetAddForms(); }}>
        <DialogContent className="sm:max-w-[980px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building className="w-5 h-5" />
              Add New Listing
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleAdd}>
            <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">

              {/* Category (drives whether this is Doctor vs Business form) */}
              <div className="space-y-2">
                <Label>Category *</Label>
                <Select
                  value={addIsDoctor ? newDoctor.category_id : newBusiness.category_id}
                  onValueChange={(v) => {
                    const isDoc = isDoctorCategory(categoryById(categories, Number(v)));
                    if (isDoc) {
                      setNewDoctor((prev) => ({ ...prev, category_id: v }));
                      setNewBusiness((prev) => ({ ...prev, category_id: "" }));
                    } else {
                      setNewBusiness((prev) => ({ ...prev, category_id: v }));
                      setNewDoctor((prev) => ({ ...prev, category_id: "" }));
                    }
                  }}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {[...categories]
                      .sort((a, b) => fullLabel(a).localeCompare(fullLabel(b)))
                      .map((cat) => (
                        <SelectItem key={cat.id} value={String(cat.id)}>
                          {fullLabel(cat)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <div className="text-xs text-muted-foreground">
                  This will determine whether you’re adding a Business or a Provider.
                </div>
              </div>

              {addIsDoctor ? (
                /* ---------------- Doctor form (like Addbusinesses.jsx semantics) ---------------- */
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2 md:col-span-2">
                      <Label>Provider Name *</Label>
                      <Input
                        value={newDoctor.provider_name}
                        onChange={(e) => handleNewInputChange(setNewDoctor)("provider_name", e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Specialty</Label>
                      <Input
                        value={newDoctor.specialty}
                        onChange={(e) => handleNewInputChange(setNewDoctor)("specialty", e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Email + works_for_url */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Email (public)</Label>
                      <Input
                        type="email"
                        value={newDoctor.email}
                        onChange={(e) => handleNewInputChange(setNewDoctor)("email", e.target.value)}
                        placeholder="name@clinic.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Working with/for (Link URL)</Label>
                      <Input
                        type="url"
                        value={newDoctor.works_for_url}
                        onChange={(e) => handleNewInputChange(setNewDoctor)("works_for_url", e.target.value)}
                        placeholder="https://clinic-or-firm.example.com"
                      />
                      <div className="text-xs text-muted-foreground">
                        Link this provider to a business/clinic via URL (optional).
                      </div>
                    </div>
                  </div>

                  {/* Address */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="space-y-2 md:col-span-2">
                      <Label>Street Address</Label>
                      <Input
                        value={newDoctor.street_address}
                        onChange={(e) => handleNewInputChange(setNewDoctor)("street_address", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>City</Label>
                      <Input
                        value={newDoctor.city}
                        onChange={(e) => handleNewInputChange(setNewDoctor)("city", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>State</Label>
                      <Input
                        value={newDoctor.state}
                        onChange={(e) => handleNewInputChange(setNewDoctor)("state", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Zip</Label>
                      <Input
                        value={newDoctor.zip}
                        onChange={(e) => handleNewInputChange(setNewDoctor)("zip", e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Contact */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Website</Label>
                      <Input
                        type="url"
                        value={newDoctor.website}
                        onChange={(e) => handleNewInputChange(setNewDoctor)("website", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input
                        type="tel"
                        value={newDoctor.phone}
                        onChange={(e) => handleNewInputChange(setNewDoctor)("phone", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Image URL</Label>
                      <Input
                        type="url"
                        value={newDoctor.image_url}
                        onChange={(e) => handleNewInputChange(setNewDoctor)("image_url", e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Profile */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Insurances</Label>
                      <Textarea
                        value={newDoctor.insurances}
                        onChange={(e) => handleNewInputChange(setNewDoctor)("insurances", e.target.value)}
                        rows={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Popular Visit Reasons</Label>
                      <Textarea
                        value={newDoctor.popular_visit_reasons}
                        onChange={(e) => handleNewInputChange(setNewDoctor)("popular_visit_reasons", e.target.value)}
                        rows={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Practice Names</Label>
                      <Textarea
                        value={newDoctor.practice_names}
                        onChange={(e) => handleNewInputChange(setNewDoctor)("practice_names", e.target.value)}
                        rows={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Educations</Label>
                      <Textarea
                        value={newDoctor.educations}
                        onChange={(e) => handleNewInputChange(setNewDoctor)("educations", e.target.value)}
                        rows={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Languages</Label>
                      <Input
                        value={newDoctor.languages}
                        onChange={(e) => handleNewInputChange(setNewDoctor)("languages", e.target.value)}
                        placeholder="e.g., English; Spanish"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Gender</Label>
                      <Input
                        value={newDoctor.gender}
                        onChange={(e) => handleNewInputChange(setNewDoctor)("gender", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>NPI Number</Label>
                      <Input
                        value={newDoctor.npi_number}
                        onChange={(e) => handleNewInputChange(setNewDoctor)("npi_number", e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={newDoctor.description}
                      onChange={(e) => handleNewInputChange(setNewDoctor)("description", e.target.value)}
                      rows={3}
                    />
                  </div>
                </>
              ) : (
                /* ---------------- Business form ---------------- */
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2 md:col-span-2">
                      <Label>Business Name *</Label>
                      <Input
                        value={newBusiness.name}
                        onChange={(e) => handleNewInputChange(setNewBusiness)("name", e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>License</Label>
                      <Input
                        value={newBusiness.license}
                        onChange={(e) => handleNewInputChange(setNewBusiness)("license", e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Email + works_for_url */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Email (public)</Label>
                      <Input
                        type="email"
                        value={newBusiness.email}
                        onChange={(e) => handleNewInputChange(setNewBusiness)("email", e.target.value)}
                        placeholder="hello@firm.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Working with/for (Link URL)</Label>
                      <Input
                        type="url"
                        value={newBusiness.works_for_url}
                        onChange={(e) => handleNewInputChange(setNewBusiness)("works_for_url", e.target.value)}
                        placeholder="https://parent-business.example.com"
                      />
                      <div className="text-xs text-muted-foreground">
                        Use when this entry works with/for another business (optional).
                      </div>
                    </div>
                  </div>

                  {/* Address */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="space-y-2 md:col-span-2">
                      <Label>Street Address</Label>
                      <Input
                        value={newBusiness.street_address}
                        onChange={(e) => handleNewInputChange(setNewBusiness)("street_address", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>City</Label>
                      <Input
                        value={newBusiness.city}
                        onChange={(e) => handleNewInputChange(setNewBusiness)("city", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>State</Label>
                      <Input
                        value={newBusiness.state}
                        onChange={(e) => handleNewInputChange(setNewBusiness)("state", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Zip</Label>
                      <Input
                        value={newBusiness.zip}
                        onChange={(e) => handleNewInputChange(setNewBusiness)("zip", e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Contact */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Website</Label>
                      <Input
                        type="url"
                        value={newBusiness.website}
                        onChange={(e) => handleNewInputChange(setNewBusiness)("website", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input
                        type="tel"
                        value={newBusiness.phone}
                        onChange={(e) => handleNewInputChange(setNewBusiness)("phone", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Image URL</Label>
                      <Input
                        type="url"
                        value={newBusiness.image_url}
                        onChange={(e) => handleNewInputChange(setNewBusiness)("image_url", e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Profile fields */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Practice Areas</Label>
                      <Textarea
                        value={newBusiness.practice_areas}
                        onChange={(e) => handleNewInputChange(setNewBusiness)("practice_areas", e.target.value)}
                        rows={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Language(s)</Label>
                      <Input
                        value={newBusiness.language}
                        onChange={(e) => handleNewInputChange(setNewBusiness)("language", e.target.value)}
                        placeholder="e.g., English; Spanish"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Honors</Label>
                      <Textarea
                        value={newBusiness.honors}
                        onChange={(e) => handleNewInputChange(setNewBusiness)("honors", e.target.value)}
                        rows={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Work Experience</Label>
                      <Textarea
                        value={newBusiness.work_experience}
                        onChange={(e) => handleNewInputChange(setNewBusiness)("work_experience", e.target.value)}
                        rows={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Associations</Label>
                      <Textarea
                        value={newBusiness.associations}
                        onChange={(e) => handleNewInputChange(setNewBusiness)("associations", e.target.value)}
                        rows={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Education</Label>
                      <Textarea
                        value={newBusiness.education}
                        onChange={(e) => handleNewInputChange(setNewBusiness)("education", e.target.value)}
                        rows={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Speaking Engagements</Label>
                      <Textarea
                        value={newBusiness.speaking_engagements}
                        onChange={(e) => handleNewInputChange(setNewBusiness)("speaking_engagements", e.target.value)}
                        rows={2}
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Publications</Label>
                      <Textarea
                        value={newBusiness.publications}
                        onChange={(e) => handleNewInputChange(setNewBusiness)("publications", e.target.value)}
                        rows={2}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={newBusiness.description}
                      onChange={(e) => handleNewInputChange(setNewBusiness)("description", e.target.value)}
                      rows={3}
                    />
                  </div>
                </>
              )}

              {/* Status / Premium */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={addIsDoctor ? newDoctor.status : newBusiness.status}
                    onValueChange={(v) => {
                      if (addIsDoctor) setNewDoctor((p) => ({ ...p, status: v }));
                      else setNewBusiness((p) => ({ ...p, status: v }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Premium</Label>
                  <div className="flex h-10 items-center rounded-md border px-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={Boolean(addIsDoctor ? newDoctor.is_premium : newBusiness.is_premium)}
                        onCheckedChange={(v) => {
                          if (addIsDoctor) setNewDoctor((p) => ({ ...p, is_premium: v }));
                          else setNewBusiness((p) => ({ ...p, is_premium: v }));
                        }}
                      />
                      <span className="text-sm text-muted-foreground">
                        {(addIsDoctor ? newDoctor.is_premium : newBusiness.is_premium) ? "Premium ON" : "Premium OFF"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-lg border">
                <p className="text-sm">
                  <strong>Notifications:</strong>{" "}
                  {sendEmail
                    ? "An approval email may be sent when created or activated."
                    : "Email notifications are disabled for this action."}
                </p>
              </div>
            </div>

            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setShowAddDialog(false); resetAddForms(); }}
                disabled={adding}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={adding || !(newBusiness.category_id || newDoctor.category_id)}>
                {adding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {adding ? "Adding..." : "Add Listing"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[1000px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5" /> Edit {editTarget?.entity === ENTITY.DOCTOR ? "Doctor" : "Business"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveEdit}>
            <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-2">
              {editTarget?.entity === ENTITY.DOCTOR ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2 md:col-span-2">
                      <Label>Provider Name *</Label>
                      <Input
                        value={editData.provider_name || ""}
                        onChange={(e) => handleEditChange("provider_name", e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Specialty</Label>
                      <Input
                        value={editData.specialty || ""}
                        onChange={(e) => handleEditChange("specialty", e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Email + works_for_url */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Email (public)</Label>
                      <Input
                        type="email"
                        value={editData.email || ""}
                        onChange={(e) => handleEditChange("email", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Working with/for (Link URL)</Label>
                      <Input
                        type="url"
                        value={editData.works_for_url || ""}
                        onChange={(e) => handleEditChange("works_for_url", e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Category *</Label>
                    <Select
                      value={editData.category_id}
                      onValueChange={(v) => handleEditChange("category_id", v)}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                      <SelectContent>
                        {[...categories]
                          .sort((a, b) => fullLabel(a).localeCompare(fullLabel(b)))
                          .map((cat) => (
                            <SelectItem key={cat.id} value={String(cat.id)}>
                              {fullLabel(cat)}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Address */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="space-y-2 md:col-span-2">
                      <Label>Street Address</Label>
                      <Input
                        value={editData.street_address || ""}
                        onChange={(e) => handleEditChange("street_address", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>City</Label>
                      <Input
                        value={editData.city || ""}
                        onChange={(e) => handleEditChange("city", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>State</Label>
                      <Input
                        value={editData.state || ""}
                        onChange={(e) => handleEditChange("state", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Zip</Label>
                      <Input
                        value={editData.zip || ""}
                        onChange={(e) => handleEditChange("zip", e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Contact */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Website</Label>
                      <Input
                        type="url"
                        value={editData.website || ""}
                        onChange={(e) => handleEditChange("website", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input
                        type="tel"
                        value={editData.phone || ""}
                        onChange={(e) => handleEditChange("phone", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Image URL</Label>
                      <Input
                        type="url"
                        value={editData.image_url || ""}
                        onChange={(e) => handleEditChange("image_url", e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Profile */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Insurances</Label>
                      <Textarea
                        value={editData.insurances || ""}
                        onChange={(e) => handleEditChange("insurances", e.target.value)}
                        rows={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Popular Visit Reasons</Label>
                      <Textarea
                        value={editData.popular_visit_reasons || ""}
                        onChange={(e) => handleEditChange("popular_visit_reasons", e.target.value)}
                        rows={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Practice Names</Label>
                      <Textarea
                        value={editData.practice_names || ""}
                        onChange={(e) => handleEditChange("practice_names", e.target.value)}
                        rows={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Educations</Label>
                      <Textarea
                        value={editData.educations || ""}
                        onChange={(e) => handleEditChange("educations", e.target.value)}
                        rows={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Languages</Label>
                      <Input
                        value={editData.languages || ""}
                        onChange={(e) => handleEditChange("languages", e.target.value)}
                        placeholder="e.g., English; Spanish"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Gender</Label>
                      <Input
                        value={editData.gender || ""}
                        onChange={(e) => handleEditChange("gender", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>NPI Number</Label>
                      <Input
                        value={editData.npi_number || ""}
                        onChange={(e) => handleEditChange("npi_number", e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={editData.description || ""}
                      onChange={(e) => handleEditChange("description", e.target.value)}
                      rows={3}
                    />
                  </div>
                </>
              ) : (
                <>
                  {/* Business edit */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2 md:col-span-2">
                      <Label>Business Name *</Label>
                      <Input
                        value={editData.name || ""}
                        onChange={(e) => handleEditChange("name", e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>License</Label>
                      <Input
                        value={editData.license || ""}
                        onChange={(e) => handleEditChange("license", e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Email + works_for_url */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Email (public)</Label>
                      <Input
                        type="email"
                        value={editData.email || ""}
                        onChange={(e) => handleEditChange("email", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Working with/for (Link URL)</Label>
                      <Input
                        type="url"
                        value={editData.works_for_url || ""}
                        onChange={(e) => handleEditChange("works_for_url", e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Category *</Label>
                    <Select
                      value={editData.category_id}
                      onValueChange={(v) => handleEditChange("category_id", v)}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                      <SelectContent>
                        {[...categories]
                          .sort((a, b) => fullLabel(a).localeCompare(fullLabel(b)))
                          .map((cat) => (
                            <SelectItem key={cat.id} value={String(cat.id)}>
                              {fullLabel(cat)}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Address */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="space-y-2 md:col-span-2">
                      <Label>Street Address</Label>
                      <Input
                        value={editData.street_address || ""}
                        onChange={(e) => handleEditChange("street_address", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>City</Label>
                      <Input
                        value={editData.city || ""}
                        onChange={(e) => handleEditChange("city", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>State</Label>
                      <Input
                        value={editData.state || ""}
                        onChange={(e) => handleEditChange("state", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Zip</Label>
                      <Input
                        value={editData.zip || ""}
                        onChange={(e) => handleEditChange("zip", e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Contact */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Website</Label>
                      <Input
                        type="url"
                        value={editData.website || ""}
                        onChange={(e) => handleEditChange("website", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input
                        type="tel"
                        value={editData.phone || ""}
                        onChange={(e) => handleEditChange("phone", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Image URL</Label>
                      <Input
                        type="url"
                        value={editData.image_url || ""}
                        onChange={(e) => handleEditChange("image_url", e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Profile */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Practice Areas</Label>
                      <Textarea
                        value={editData.practice_areas || ""}
                        onChange={(e) => handleEditChange("practice_areas", e.target.value)}
                        rows={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Language(s)</Label>
                      <Input
                        value={editData.language || ""}
                        onChange={(e) => handleEditChange("language", e.target.value)}
                        placeholder="e.g., English; Spanish"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Honors</Label>
                      <Textarea
                        value={editData.honors || ""}
                        onChange={(e) => handleEditChange("honors", e.target.value)}
                        rows={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Work Experience</Label>
                      <Textarea
                        value={editData.work_experience || ""}
                        onChange={(e) => handleEditChange("work_experience", e.target.value)}
                        rows={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Associations</Label>
                      <Textarea
                        value={editData.associations || ""}
                        onChange={(e) => handleEditChange("associations", e.target.value)}
                        rows={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Education</Label>
                      <Textarea
                        value={editData.education || ""}
                        onChange={(e) => handleEditChange("education", e.target.value)}
                        rows={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Speaking Engagements</Label>
                      <Textarea
                        value={editData.speaking_engagements || ""}
                        onChange={(e) => handleEditChange("speaking_engagements", e.target.value)}
                        rows={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Publications</Label>
                      <Textarea
                        value={editData.publications || ""}
                        onChange={(e) => handleEditChange("publications", e.target.value)}
                        rows={2}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={editData.description || ""}
                      onChange={(e) => handleEditChange("description", e.target.value)}
                      rows={3}
                    />
                  </div>
                </>
              )}

              {/* Status / Premium */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={editData.status}
                    onValueChange={(v) => handleEditChange("status", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Premium</Label>
                  <div className="flex h-10 items-center rounded-md border px-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={Boolean(editData.is_premium)}
                        onCheckedChange={(v) => handleEditChange("is_premium", v)}
                      />
                      <span className="text-sm text-muted-foreground">
                        {editData.is_premium ? "Premium ON" : "Premium OFF"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-lg border">
                <p className="text-sm">
                  <strong>Notifications:</strong>{" "}
                  {sendEmail
                    ? "If status changes to active, an approval email may be sent."
                    : "Email notifications are disabled for this action."}
                </p>
              </div>
            </div>

            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowEditDialog(false)}
                disabled={savingEdit}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={savingEdit}>
                {savingEdit && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {savingEdit ? "Saving…" : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk Move Dialog */}
      <Dialog open={showBulkMove} onOpenChange={setShowBulkMove}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>
              Move {selectedKeys.size} listing{selectedKeys.size === 1 ? "" : "s"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={performBulkMove} className="space-y-4">
            <div className="space-y-2">
              <Label>
                Destination Category (within “{selectedRootSegment || "—"}”)
              </Label>
              <Select
                value={bulkMoveCategoryId}
                onValueChange={(v) => setBulkMoveCategoryId(v)}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder={selectedRootSegment ? "Choose a subcategory" : "Selection spans different mains"} />
                </SelectTrigger>
                <SelectContent>
                  {bulkDestOptions.map((cat) => (
                    <SelectItem key={cat.id} value={String(cat.id)}>
                      {fullLabel(cat)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!selectedRootSegment && (
                <div className="text-xs text-red-600">
                  Select listings under the same main category to continue.
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowBulkMove(false)}
                disabled={moving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!bulkMoveCategoryId || moving}>
                {moving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {moving ? "Moving…" : "Move"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
