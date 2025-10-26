import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileText, Tag, CheckCircle, AlertCircle, Building, Edit, Plus, Save, X } from "lucide-react";

// APIs
import { listPageMetaPaged as listPageMetaPagedAPI, createPageMeta, updatePageMeta, listPageMetaByIds } from "@/api/pagemeta";
import { listBusinessesPaged } from "@/api/businesses";
import { listDoctorsPaged } from "@/api/doctors";
import { me as getMe } from "@/api/users";

/* ----------------------------- constants ----------------------------- */

const DEFAULT_PAGES = [
  { page_name: "home", display_name: "Home Page" },
  { page_name: "search", display_name: "Search Page" },
  { page_name: "addbusiness", display_name: "Add Business Page" },
  { page_name: "businessowner", display_name: "Business Owner Page" },
  { page_name: "premium", display_name: "Premium Page" },
  { page_name: "crowdfund", display_name: "Crowdfund Page" },
  { page_name: "compare", display_name: "Compare Page" },
  { page_name: "profile", display_name: "Profile Page" },
  { page_name: "dashboard", display_name: "Dashboard Page" },
  { page_name: "ownerdashboard", display_name: "Owner Dashboard Page" },
  { page_name: "termsofservice", display_name: "Terms of Service Page" },
];

/* ------------------------ SEO helper functions ----------------------- */

const buildLocation = (obj) => {
  const parts = [obj?.city, obj?.state].filter(Boolean);
  return parts.join(", ");
};

/** Lawyer (Business) SEO */
const buildLawyerSeo = (biz) => {
  const loc = buildLocation(biz);
  const title = loc ? `${biz?.name}, a lawyer in ${loc}` : `${biz?.name} — Lawyer`;
  const keywords = loc
    ? `${biz?.name}, lawyer in ${loc}, lawyer reviews in ${loc}`
    : `${biz?.name}, lawyer, lawyer reviews`;
  const ogTitle = loc ? `${biz?.name} | Lawyer in ${loc}` : `${biz?.name} | Lawyer`;
  const ogDesc =
    biz?.description || (loc ? `Read reviews of ${biz?.name}, a lawyer in ${loc}.` : `Read reviews of ${biz?.name}.`);
  return { title, keywords, ogTitle, ogDesc };
};

/** Doctor SEO */
const buildDoctorSeo = (doc) => {
  const loc = buildLocation(doc);
  const name = doc?.provider_name || "Doctor";
  const spec = (doc?.specialty || "").trim();
  const role = spec ? `a ${spec} in ${loc || ""}`.trim() : `a doctor in ${loc || ""}`.trim();
  const title = loc ? `${name}, ${role}` : `${name} — Doctor`;
  const keywords = loc
    ? `${name}, ${spec ? `${spec}, ` : ""}doctor in ${loc}, doctor reviews in ${loc}`
    : `${name}, ${spec || "doctor"}, doctor reviews`;
  const ogTitle = loc ? `${name} | ${spec ? `${spec} in ${loc}` : `Doctor in ${loc}`}` : `${name} | Doctor`;
  const ogDesc =
    doc?.description ||
    (loc ? `Read reviews of ${name}, ${spec ? `${spec} in ${loc}` : `a doctor in ${loc}`}.` : `Read reviews of ${name}.`);
  return { title, keywords, ogTitle, ogDesc };
};

/* ----------------------------- component ----------------------------- */

export default function AdminMetaManagerPage() {
  const navigate = useNavigate();

  // meta configs (global cache; now fetched via resilient pager)
  const [metaConfigs, setMetaConfigs] = useState([]);
  const [loading, setLoading] = useState(true);

  // businesses (paged)
  const [businesses, setBusinesses] = useState([]);
  const [bizTotal, setBizTotal] = useState(0);
  const [bizPage, setBizPage] = useState(1);
  const [bizPageSize, setBizPageSize] = useState(50);
  const [loadingBiz, setLoadingBiz] = useState(false);
  const [metaByBusinessId, setMetaByBusinessId] = useState(new Map());

  // doctors (paged)
  const [doctors, setDoctors] = useState([]);
  const [docTotal, setDocTotal] = useState(0);
  const [docPage, setDocPage] = useState(1);
  const [docPageSize, setDocPageSize] = useState(50);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [metaByDoctorId, setMetaByDoctorId] = useState(new Map());

  // editing state
  const [editingConfig, setEditingConfig] = useState(null);
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);

  // search/filter + tabs
  const [searchFilter, setSearchFilter] = useState("");
  const [activeTab, setActiveTab] = useState("static");

  const [message, setMessage] = useState({ type: "", text: "" });

  /* ------------------------------ auth/init ------------------------------ */

  useEffect(() => {
    checkAdminAndLoadMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isAdmin = (u) => u?.user_type === "admin" || u?.role === "admin" || !!u?.is_staff;

  const checkAdminAndLoadMeta = async () => {
    try {
      const user = await getMe().catch(() => null);
      if (!user || !isAdmin(user)) {
        navigate(createPageUrl("Home"));
        return;
      }
      await loadMetaConfigs();
    } finally {
      setLoading(false);
    }
  };

  const loadMetaConfigs = async () => {
    try {
      // Only static rows up front (small set)
      const { items } = await listPageMetaPagedAPI({
        meta_type: "static",
        limit: 200,
        offset: 0,
        ordering: "-updated_at",
      });
      setMetaConfigs(Array.isArray(items) ? items : []);
    } catch (error) {
      console.error("Failed to load meta configs:", error);
      showMessage("error", "Could not load meta configurations.");
      setMetaConfigs([]);
    }
  };

  /* ------------------------ list loaders (per tab) ----------------------- */

  useEffect(() => {
    if (activeTab === "business") loadBusinessesList();
    if (activeTab === "doctor") loadDoctorsList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, bizPage, bizPageSize, docPage, docPageSize, searchFilter]);

  const buildBizParams = () => {
    const params = {
      limit: bizPageSize,
      offset: (bizPage - 1) * bizPageSize,
      ordering: "-updated_at",
      status: "active",
    };
    const q = searchFilter.trim();
    if (q) params.search = q;
    return params;
  };

  const buildDocParams = () => {
    const params = {
      limit: docPageSize,
      offset: (docPage - 1) * docPageSize,
      ordering: "-updated_at",
      status: "active",
    };
    const q = searchFilter.trim();
    if (q) params.search = q;
    return params;
  };

  const loadBusinessesList = async () => {
    setLoadingBiz(true);
    try {
      const { items, count } = await listBusinessesPaged(buildBizParams());
      const list = items || [];
      setBusinesses(list);
      setBizTotal(Number(count || 0));
      await hydrateMetaForBusinesses(list.map((b) => b.id));
    } catch (error) {
      console.error("Failed to load businesses:", error);
      setBusinesses([]);
      setBizTotal(0);
      showMessage("error", "Failed to load businesses.");
    } finally {
      setLoadingBiz(false);
    }
  };

  const loadDoctorsList = async () => {
    setLoadingDoc(true);
    try {
      const { items, count } = await listDoctorsPaged(buildDocParams());
      const list = items || [];
      setDoctors(list);
      setDocTotal(Number(count || 0));
      await hydrateMetaForDoctors(list.map((d) => d.id));
    } catch (error) {
      console.error("Failed to load doctors:", error);
      setDoctors([]);
      setDocTotal(0);
      showMessage("error", "Failed to load doctors.");
    } finally {
      setLoadingDoc(false);
    }
  };

  /* --------------------------- meta hydration --------------------------- */

  const hydrateMetaForBusinesses = async (bizIds = []) => {
    const ids = (Array.isArray(bizIds) ? bizIds : []).filter(Boolean);
    if (!ids.length) return;

    try {
      const rows = await listPageMetaByIds({ businessIds: ids });
      const newMap = new Map(metaByBusinessId);
      const merged = new Map(metaConfigs.map(m => [m.id, m]));

      for (const pm of rows) {
        if (pm.meta_type !== "business") continue;
        newMap.set(pm.business_id, pm);
        merged.set(pm.id, pm);
      }

      setMetaByBusinessId(newMap);
      setMetaConfigs(Array.from(merged.values()));
    } catch (e) {
      // non-fatal
      console.error("hydrateMetaForBusinesses failed", e);
    }
  };

  const hydrateMetaForDoctors = async (docIds = []) => {
    const ids = (Array.isArray(docIds) ? docIds : []).filter(Boolean);
    if (!ids.length) return;

    try {
      const rows = await listPageMetaByIds({ doctorIds: ids });
      const newMap = new Map(metaByDoctorId);
      const merged = new Map(metaConfigs.map(m => [m.id, m]));

      for (const pm of rows) {
        if (pm.meta_type !== "doctor") continue;
        newMap.set(pm.doctor_id, pm);
        merged.set(pm.id, pm);
      }

      setMetaByDoctorId(newMap);
      setMetaConfigs(Array.from(merged.values()));
    } catch (e) {
      console.error("hydrateMetaForDoctors failed", e);
    }
  };

  /* ------------------------------- helpers ------------------------------ */

  const handleEdit = (config) => {
    setEditingConfig(config);
    setFormData(config);
    setMessage({ type: "", text: "" });
  };

  const handleCancel = () => {
    setEditingConfig(null);
    setFormData({});
  };

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: "", text: "" }), 3000);
  };

  /* -------------------------------- save -------------------------------- */

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      let outgoing = { ...formData };

      // Auto-apply SEO for lawyers
      if (outgoing.meta_type === "business" && outgoing.business_id) {
        const biz = businesses.find((b) => b.id === outgoing.business_id);
        if (biz) {
          const { title, keywords, ogTitle, ogDesc } = buildLawyerSeo(biz);
          outgoing.title = outgoing.title || title;
          outgoing.keywords = outgoing.keywords || keywords;
          outgoing.description = outgoing.description || ogDesc;
          outgoing.og_title = outgoing.og_title || ogTitle;
          outgoing.og_description = outgoing.og_description || ogDesc;
          outgoing.og_image = outgoing.og_image || biz.image_url || "";
        }
      }

      // Auto-apply SEO for doctors
      if (outgoing.meta_type === "doctor" && outgoing.doctor_id) {
        const doc = doctors.find((d) => d.id === outgoing.doctor_id);
        if (doc) {
          const { title, keywords, ogTitle, ogDesc } = buildDoctorSeo(doc);
          outgoing.title = outgoing.title || title;
          outgoing.keywords = outgoing.keywords || keywords;
          outgoing.description = outgoing.description || ogDesc;
          outgoing.og_title = outgoing.og_title || ogTitle;
          outgoing.og_description = outgoing.og_description || ogDesc;
          outgoing.og_image = outgoing.og_image || doc.image_url || "";
        }
      }

      // Normalize payload for API
      const payload = {
        page_name: outgoing.page_name,
        meta_type: outgoing.meta_type, // 'static' | 'business' | 'doctor'
        business_id: outgoing.meta_type === "business" ? (outgoing.business_id || null) : null,
        doctor_id: outgoing.meta_type === "doctor" ? (outgoing.doctor_id || null) : null,
        title: outgoing.title || "",
        description: outgoing.description || "",
        keywords: outgoing.keywords || "",
        og_title: outgoing.og_title || "",
        og_description: outgoing.og_description || "",
        og_image: outgoing.og_image || "",
        canonical_url: outgoing.canonical_url || "",
        robots: outgoing.robots || "index, follow",
        priority: typeof outgoing.priority === "number" ? outgoing.priority : 0.5,
        changefreq: outgoing.changefreq || "monthly",
        is_active: !!outgoing.is_active,
      };

      // Avoid duplicate CREATE for business meta
      if (!outgoing.id && payload.meta_type === "business" && payload.business_id) {
        const existing = metaByBusinessId.get(payload.business_id);
        if (existing && existing.meta_type === "business" && existing.page_name === "business") {
          await updatePageMeta(existing.id, payload);
          await afterSaveRefresh(existing.id, existing.business_id, null);
          showMessage("success", "Meta configuration saved successfully!");
          setEditingConfig(null);
          setFormData({});
          setSaving(false);
          return;
        }
      }

      // Avoid duplicate CREATE for doctor meta
      if (!outgoing.id && payload.meta_type === "doctor" && payload.doctor_id) {
        const existing = metaByDoctorId.get(payload.doctor_id);
        if (existing && existing.meta_type === "doctor" && existing.page_name === "doctor") {
          await updatePageMeta(existing.id, payload);
          await afterSaveRefresh(existing.id, null, existing.doctor_id);
          showMessage("success", "Meta configuration saved successfully!");
          setEditingConfig(null);
          setFormData({});
          setSaving(false);
          return;
        }
      }

      if (outgoing.id) {
        await updatePageMeta(outgoing.id, payload);
        await afterSaveRefresh(outgoing.id, payload.business_id, payload.doctor_id);
      } else {
        const created = await createPageMeta(payload);
        const createdId = created?.id;
        await afterSaveRefresh(createdId, payload.business_id, payload.doctor_id);
      }

      setEditingConfig(null);
      setFormData({});
      showMessage("success", "Meta configuration saved successfully!");
    } catch (error) {
      console.error("Failed to save config:", error);
      const apiErr =
        error?.response?.data &&
        (error.response.data.detail || Object.values(error.response.data).flat().join(" "));
      showMessage("error", apiErr || "Failed to save configuration. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Rehydrate the one affected row + reload header list
  const afterSaveRefresh = async (idMaybe, businessIdMaybe, doctorIdMaybe) => {
    try {
      if (businessIdMaybe) await hydrateMetaForBusinesses([businessIdMaybe]);
      if (doctorIdMaybe) await hydrateMetaForDoctors([doctorIdMaybe]);
      await loadMetaConfigs();
    } catch (e) {
      // non-fatal
    }
  };

  /* -------------------------- create helpers -------------------------- */

  const handleAddNewStatic = (page) => {
    const newConfig = {
      page_name: page.page_name,
      meta_type: "static",
      title: "",
      description: "",
      keywords: "",
      og_title: "",
      og_description: "",
      og_image: "",
      is_active: true,
      priority: 0.5,
      changefreq: "monthly",
      robots: "index, follow",
    };
    setEditingConfig(newConfig);
    setFormData(newConfig);
  };

  const handleAddNewBusiness = (biz) => {
    const existing = metaByBusinessId.get(biz.id);
    if (existing && existing.meta_type === "business") {
      handleEdit(existing);
      return;
    }
    const { title, keywords, ogTitle, ogDesc } = buildLawyerSeo(biz);
    const newConfig = {
      page_name: "business",
      business_id: biz.id,
      meta_type: "business",
      title,
      keywords,
      description:
        biz.description ||
        `Find reviews and information about ${biz.name}${biz.category?.name ? `, a ${biz.category.name} business.` : "."
        }`,
      og_title: ogTitle,
      og_description: ogDesc,
      og_image: biz.image_url || "",
      is_active: true,
      priority: 0.8,
      changefreq: "weekly",
      robots: "index, follow",
    };
    setEditingConfig(newConfig);
    setFormData(newConfig);
  };

  const handleAddNewDoctor = (doc) => {
    const existing = metaByDoctorId.get(doc.id);
    if (existing && existing.meta_type === "doctor") {
      handleEdit(existing);
      return;
    }
    const { title, keywords, ogTitle, ogDesc } = buildDoctorSeo(doc);
    const newConfig = {
      page_name: "doctor",
      doctor_id: doc.id,
      meta_type: "doctor",
      title,
      keywords,
      description:
        doc.description ||
        `Find reviews and information about ${doc.provider_name}${doc.specialty ? `, a ${doc.specialty}.` : "."
        }`,
      og_title: ogTitle,
      og_description: ogDesc,
      og_image: doc.image_url || "",
      is_active: true,
      priority: 0.8,
      changefreq: "weekly",
      robots: "index, follow",
    };
    setEditingConfig(newConfig);
    setFormData(newConfig);
  };

  const handleFormChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  /* ------------------------------- derived ------------------------------ */

  const staticMetaConfigs = useMemo(
    () => metaConfigs.filter((c) => c.meta_type === "static"),
    [metaConfigs]
  );
  const businessMetaConfigs = useMemo(
    () => metaConfigs.filter((c) => c.meta_type === "business"),
    [metaConfigs]
  );

  const filteredStaticPages = useMemo(
    () => DEFAULT_PAGES.filter((p) => p.display_name.toLowerCase().includes(searchFilter.toLowerCase())),
    [searchFilter]
  );

  const getBusinessFromConfig = (config) => businesses.find((b) => b.id === config.business_id);
  const getDoctorFromConfig = (config) => doctors.find((d) => d.id === config.doctor_id);

  /* ------------------------------- pagers ------------------------------- */

  const BizPager = () => {
    const totalPages = Math.max(1, Math.ceil(bizTotal / bizPageSize));
    const canPrev = bizPage > 1;
    const canNext = bizPage < totalPages;
    return (
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
        <div className="text-sm text-gray-600">
          {bizTotal > 0 ? (
            <>
              Showing <strong>{Math.min((bizPage - 1) * bizPageSize + 1, bizTotal)}–{Math.min(bizPage * bizPageSize, bizTotal)}</strong> of{" "}
              <strong>{bizTotal}</strong> businesses
            </>
          ) : (
            "No results"
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={!canPrev} onClick={() => setBizPage((p) => Math.max(1, p - 1))}>
            Prev
          </Button>
          {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
            const half = 3;
            let start = Math.max(1, bizPage - half);
            let end = Math.min(totalPages, start + 6);
            start = Math.max(1, end - 6);
            const n = start + i;
            if (n > totalPages) return null;
            const active = n === bizPage;
            return (
              <Button key={n} variant={active ? "default" : "outline"} size="sm" onClick={() => setBizPage(n)}>
                {n}
              </Button>
            );
          })}
          <Button variant="outline" size="sm" disabled={!canNext} onClick={() => setBizPage((p) => Math.min(totalPages, p + 1))}>
            Next
          </Button>
          <select
            className="ml-2 h-9 rounded-md border px-2 text-sm"
            value={bizPageSize}
            onChange={(e) => {
              setBizPageSize(Number(e.target.value));
              setBizPage(1);
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
  };

  const DocPager = () => {
    const totalPages = Math.max(1, Math.ceil(docTotal / docPageSize));
    const canPrev = docPage > 1;
    const canNext = docPage < totalPages;
    return (
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
        <div className="text-sm text-gray-600">
          {docTotal > 0 ? (
            <>
              Showing <strong>{Math.min((docPage - 1) * docPageSize + 1, docTotal)}–{Math.min(docPage * docPageSize, docTotal)}</strong> of{" "}
              <strong>{docTotal}</strong> doctors
            </>
          ) : (
            "No results"
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={!canPrev} onClick={() => setDocPage((p) => Math.max(1, p - 1))}>
            Prev
          </Button>
          {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
            const half = 3;
            let start = Math.max(1, docPage - half);
            let end = Math.min(totalPages, start + 6);
            start = Math.max(1, end - 6);
            const n = start + i;
            if (n > totalPages) return null;
            const active = n === docPage;
            return (
              <Button key={n} variant={active ? "default" : "outline"} size="sm" onClick={() => setDocPage(n)}>
                {n}
              </Button>
            );
          })}
          <Button variant="outline" size="sm" disabled={!canNext} onClick={() => setDocPage((p) => Math.min(totalPages, p + 1))}>
            Next
          </Button>
          <select
            className="ml-2 h-9 rounded-md border px-2 text-sm"
            value={docPageSize}
            onChange={(e) => {
              setDocPageSize(Number(e.target.value));
              setDocPage(1);
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
  };

  /* -------------------------------- render -------------------------------- */

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-4 md:p-8 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">SEO Meta Manager</h1>

        {editingConfig ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {editingConfig.meta_type === "business" ? (
                  <Building className="w-5 h-5" />
                ) : editingConfig.meta_type === "doctor" ? (
                  <span className="inline-flex h-5 w-5 items-center justify-center">🩺</span>
                ) : (
                  <FileText className="w-5 h-5" />
                )}
                {editingConfig.id
                  ? `Editing: ${editingConfig.meta_type === "business"
                    ? getBusinessFromConfig(editingConfig)?.name || "Business"
                    : editingConfig.meta_type === "doctor"
                      ? getDoctorFromConfig(editingConfig)?.provider_name || "Doctor"
                      : editingConfig.page_name
                  }`
                  : `New Config: ${editingConfig.meta_type === "business"
                    ? getBusinessFromConfig(editingConfig)?.name || "Business"
                    : editingConfig.meta_type === "doctor"
                      ? getDoctorFromConfig(editingConfig)?.provider_name || "Doctor"
                      : editingConfig.page_name
                  }`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSave} className="space-y-6">
                <Tabs defaultValue="general">
                  <TabsList>
                    <TabsTrigger value="general">General</TabsTrigger>
                    <TabsTrigger value="social">Social (Open Graph)</TabsTrigger>
                    <TabsTrigger value="advanced">Advanced</TabsTrigger>
                  </TabsList>

                  <TabsContent value="general" className="pt-6">
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="title">Title</Label>
                        <Input
                          id="title"
                          value={formData.title || ""}
                          onChange={(e) => handleFormChange("title", e.target.value)}
                          placeholder={
                            editingConfig.meta_type === "business"
                              ? "Acme Law, a lawyer in Austin, TX"
                              : editingConfig.meta_type === "doctor"
                                ? "Dr. Jane Doe, a cardiologist in Austin, TX"
                                : "Page Title"
                          }
                        />
                        {editingConfig.meta_type === "business" && (
                          <p className="text-xs text-gray-500 mt-1">
                            Auto-applied for lawyers: “&lt;Name&gt;, a lawyer in &lt;City, State&gt;”
                          </p>
                        )}
                        {editingConfig.meta_type === "doctor" && (
                          <p className="text-xs text-gray-500 mt-1">
                            Auto-applied for doctors: “&lt;Name&gt;, a &lt;Specialty&gt; in &lt;City, State&gt;”
                          </p>
                        )}
                      </div>
                      <div>
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                          id="description"
                          value={formData.description || ""}
                          onChange={(e) => handleFormChange("description", e.target.value)}
                          placeholder="SEO-friendly description for search engines"
                          rows={3}
                        />
                      </div>
                      <div>
                        <Label htmlFor="keywords">Keywords (comma-separated)</Label>
                        <Input
                          id="keywords"
                          value={formData.keywords || ""}
                          onChange={(e) => handleFormChange("keywords", e.target.value)}
                          placeholder={
                            editingConfig.meta_type === "business"
                              ? "Acme Law, lawyer in Austin, TX, lawyer reviews in Austin, TX"
                              : editingConfig.meta_type === "doctor"
                                ? "Dr. Jane Doe, cardiologist in Austin, TX, doctor reviews in Austin, TX"
                                : "keyword1, keyword2"
                          }
                        />
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="social" className="pt-6">
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="og_title">Open Graph Title</Label>
                        <Input
                          id="og_title"
                          value={formData.og_title || ""}
                          onChange={(e) => handleFormChange("og_title", e.target.value)}
                          placeholder="Title when shared on social media"
                        />
                      </div>
                      <div>
                        <Label htmlFor="og_description">Open Graph Description</Label>
                        <Textarea
                          id="og_description"
                          value={formData.og_description || ""}
                          onChange={(e) => handleFormChange("og_description", e.target.value)}
                          placeholder="Description when shared on social media"
                          rows={3}
                        />
                      </div>
                      <div>
                        <Label htmlFor="og_image">Open Graph Image URL</Label>
                        <Input
                          id="og_image"
                          type="url"
                          value={formData.og_image || ""}
                          onChange={(e) => handleFormChange("og_image", e.target.value)}
                          placeholder="https://example.com/image.jpg"
                        />
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="advanced" className="pt-6">
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="canonical_url">Canonical URL</Label>
                        <Input
                          id="canonical_url"
                          type="url"
                          value={formData.canonical_url || ""}
                          onChange={(e) => handleFormChange("canonical_url", e.target.value)}
                          placeholder="https://example.com/canonical-url"
                        />
                      </div>
                      <div>
                        <Label htmlFor="robots">Robots Meta Tag</Label>
                        <Select value={formData.robots || "index, follow"} onValueChange={(v) => handleFormChange("robots", v)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="index, follow">Index, Follow</SelectItem>
                            <SelectItem value="noindex, follow">No Index, Follow</SelectItem>
                            <SelectItem value="index, nofollow">Index, No Follow</SelectItem>
                            <SelectItem value="noindex, nofollow">No Index, No Follow</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="priority">Sitemap Priority (0.1-1.0)</Label>
                          <Input
                            id="priority"
                            type="number"
                            step="0.1"
                            min="0.1"
                            max="1.0"
                            value={formData.priority ?? 0.5}
                            onChange={(e) => handleFormChange("priority", parseFloat(e.target.value))}
                          />
                        </div>
                        <div>
                          <Label htmlFor="changefreq">Change Frequency</Label>
                          <Select value={formData.changefreq || "monthly"} onValueChange={(v) => handleFormChange("changefreq", v)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="always">Always</SelectItem>
                              <SelectItem value="hourly">Hourly</SelectItem>
                              <SelectItem value="daily">Daily</SelectItem>
                              <SelectItem value="weekly">Weekly</SelectItem>
                              <SelectItem value="monthly">Monthly</SelectItem>
                              <SelectItem value="yearly">Yearly</SelectItem>
                              <SelectItem value="never">Never</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch id="is_active" checked={!!formData.is_active} onCheckedChange={(v) => handleFormChange("is_active", v)} />
                        <Label htmlFor="is_active">Is Active</Label>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>

                {message.text && (
                  <Alert variant={message.type === "error" ? "destructive" : "default"} className="mt-4">
                    {message.type === "success" ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                    <AlertDescription>{message.text}</AlertDescription>
                  </Alert>
                )}

                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={handleCancel}>
                    <X className="w-4 h-4 mr-2" /> Cancel
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? (
                      <>
                        <Save className="w-4 h-4 mr-2 animate-spin" /> Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" /> Save
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Tabs
            value={activeTab}
            onValueChange={(v) => {
              setActiveTab(v);
              if (v === "business") setBizPage(1);
              if (v === "doctor") setDocPage(1);
            }}
          >
            <TabsList className="mb-6">
              <TabsTrigger value="static" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Static Pages ({DEFAULT_PAGES.length})
              </TabsTrigger>
              <TabsTrigger value="business" className="flex items-center gap-2">
                <Building className="w-4 h-4" />
                Business Pages
              </TabsTrigger>
              <TabsTrigger value="doctor" className="flex items-center gap-2">
                <span className="inline-flex h-4 w-4 items-center justify-center">🩺</span>
                Doctor Pages
              </TabsTrigger>
            </TabsList>

            {/* Static Pages */}
            <TabsContent value="static">
              <Card>
                <CardHeader>
                  <CardTitle>Static Page Meta Configurations</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <Input placeholder="Search static pages..." value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredStaticPages.map((page) => {
                      const config = staticMetaConfigs.find((c) => c.page_name === page.page_name);
                      return (
                        <Card key={page.page_name} className="flex flex-col">
                          <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                              <FileText className="w-5 h-5" />
                              {page.display_name}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="flex-grow">
                            {config ? (
                              <div className="space-y-2">
                                <p className="text-sm text-gray-600 truncate" title={config.title}>
                                  <Tag className="w-4 h-4 inline-block mr-1" />
                                  {config.title}
                                </p>
                                <Badge variant={config.is_active ? "default" : "secondary"}>
                                  {config.is_active ? "Active" : "Inactive"}
                                </Badge>
                              </div>
                            ) : (
                              <p className="text-sm text-gray-400">Not configured yet.</p>
                            )}
                          </CardContent>
                          <div className="p-4 border-t">
                            {config ? (
                              <Button variant="outline" size="sm" onClick={() => handleEdit(config)}>
                                <Edit className="w-4 h-4 mr-2" /> Edit
                              </Button>
                            ) : (
                              <Button size="sm" onClick={() => handleAddNewStatic(page)}>
                                <Plus className="w-4 h-4 mr-2" /> Create
                              </Button>
                            )}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Business Pages */}
            <TabsContent value="business">
              <Card>
                <CardHeader>
                  <CardTitle>Business Page Meta Configurations</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <Input
                      placeholder="Search businesses…"
                      value={searchFilter}
                      onChange={(e) => {
                        setSearchFilter(e.target.value);
                        setBizPage(1);
                      }}
                      className="sm:w-80"
                    />
                    {loadingBiz && <span className="text-sm text-gray-500">Loading…</span>}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {businesses.map((biz) => {
                      const configured =
                        metaByBusinessId.get(biz.id) ||
                        metaConfigs.find((c) => c.meta_type === "business" && c.business_id === biz.id);

                      const catText = typeof biz.category === "string" ? biz.category : biz.category?.name || "";

                      return (
                        <Card key={biz.id} className="flex flex-col">
                          <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                              <Building className="w-5 h-5" />
                              <div className="truncate">{biz.name}</div>
                            </CardTitle>
                            <Badge variant="outline" className="w-fit">
                              {catText || "—"}
                            </Badge>
                          </CardHeader>
                          <CardContent className="flex-grow">
                            {configured ? (
                              <div className="space-y-2">
                                <p className="text-sm text-gray-600 truncate" title={configured.title}>
                                  <Tag className="w-4 h-4 inline-block mr-1" />
                                  {configured.title}
                                </p>
                                <Badge variant={configured.is_active ? "default" : "secondary"}>
                                  {configured.is_active ? "Active" : "Inactive"}
                                </Badge>
                              </div>
                            ) : (
                              <p className="text-sm text-gray-400">Using default meta tags.</p>
                            )}
                          </CardContent>
                          <div className="p-4 border-t">
                            {configured ? (
                              <Button variant="outline" size="sm" onClick={() => handleEdit(configured)}>
                                <Edit className="w-4 h-4 mr-2" /> Edit
                              </Button>
                            ) : (
                              <Button size="sm" onClick={() => handleAddNewBusiness(biz)}>
                                <Plus className="w-4 h-4 mr-2" /> Create Custom Meta
                              </Button>
                            )}
                          </div>
                        </Card>
                      );
                    })}
                  </div>

                  <BizPager />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Doctor Pages */}
            <TabsContent value="doctor">
              <Card>
                <CardHeader>
                  <CardTitle>Doctor Page Meta Configurations</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <Input
                      placeholder="Search doctors…"
                      value={searchFilter}
                      onChange={(e) => {
                        setSearchFilter(e.target.value);
                        setDocPage(1);
                      }}
                      className="sm:w-80"
                    />
                    {loadingDoc && <span className="text-sm text-gray-500">Loading…</span>}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {doctors.map((doc) => {
                      const configured =
                        metaByDoctorId.get(doc.id) ||
                        metaConfigs.find((c) => c.meta_type === "doctor" && c.doctor_id === doc.id);

                      const catText = typeof doc.category === "string" ? doc.category : doc.category?.name || "";

                      return (
                        <Card key={doc.id} className="flex flex-col">
                          <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                              <span className="inline-flex h-5 w-5 items-center justify-center">🩺</span>
                              <div className="truncate">{doc.provider_name}</div>
                            </CardTitle>
                            <Badge variant="outline" className="w-fit">
                              {doc.specialty || catText || "—"}
                            </Badge>
                          </CardHeader>
                          <CardContent className="flex-grow">
                            {configured ? (
                              <div className="space-y-2">
                                <p className="text-sm text-gray-600 truncate" title={configured.title}>
                                  <Tag className="w-4 h-4 inline-block mr-1" />
                                  {configured.title}
                                </p>
                                <Badge variant={configured.is_active ? "default" : "secondary"}>
                                  {configured.is_active ? "Active" : "Inactive"}
                                </Badge>
                              </div>
                            ) : (
                              <p className="text-sm text-gray-400">Using default meta tags.</p>
                            )}
                          </CardContent>
                          <div className="p-4 border-t">
                            {configured ? (
                              <Button variant="outline" size="sm" onClick={() => handleEdit(configured)}>
                                <Edit className="w-4 h-4 mr-2" /> Edit
                              </Button>
                            ) : (
                              <Button size="sm" onClick={() => handleAddNewDoctor(doc)}>
                                <Plus className="w-4 h-4 mr-2" /> Create Custom Meta
                              </Button>
                            )}
                          </div>
                        </Card>
                      );
                    })}
                  </div>

                  <DocPager />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
