// src/pages/BulkUploadPage.jsx
import React, { useState, useCallback, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import {
  Upload,
  Loader2,
  CheckCircle,
  AlertCircle,
  Building,
  ArrowLeft,
  Download,
  Stethoscope,
} from "lucide-react";
import Papa from "papaparse";

// APIs
import { me as getMe } from "@/api/users";
import { listCategories } from "@/api/categories";
import { bulkCreateBusinesses } from "@/api/businesses";
import { bulkCreateDoctors } from "@/api/doctors"; // <-- add this API (parallel to businesses)

// Tunables
const PREVIEW_LIMIT = 100;
const BATCH_SIZE = 3000;
const PROGRESS_EVERY = BATCH_SIZE;
const CHUNK_SIZE_BYTES = 1024 * 1024; // 1MB
const USE_WORKER = false;

export default function BulkUploadPage() {
  const [user, setUser] = useState(null);

  // import type: "business" | "doctor"
  const [importType, setImportType] = useState("business");

  // Categories (shared UI; if doctors use different taxonomy, replace listCategories for doctors)
  const [categories, setCategories] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");

  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("idle"); // idle, parsing, importing, success, error
  const [error, setError] = useState("");

  const [previewRows, setPreviewRows] = useState([]);
  const [processedCount, setProcessedCount] = useState(0);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [successCount, setSuccessCount] = useState(0);

  const previewCountRef = useRef(0);
  const abortedRef = useRef(false);
  const parserRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const headerSeenRef = useRef({});

  useEffect(() => {
    (async () => {
      try {
        const [u, cats] = await Promise.all([
          getMe().catch(() => null),
          listCategories().catch(() => []), // If doctors have separate categories, branch on `importType`
        ]);
        setUser(u);
        setCategories(Array.isArray(cats) ? cats : []);
      } catch {
        setUser(null);
        setCategories([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (status === "parsing" || status === "importing") {
      const id = setInterval(() => {
        getMe().catch(() => {});
      }, 60_000);
      return () => clearInterval(id);
    }
  }, [status]);

  const downloadSampleCSV = () => {
    // One CSV works for both; doctor import maps practice areas->specialty, name->provider_name
    const sampleData = [
      [
        "name",
        "license",
        "street address",
        "city",
        "state",
        "zip",
        "website",
        "phone",
        "practice areas",
        "language",
        "honors",
        "work experience",
        "associations",
        "education",
        "speaking engagements",
        "publications",
        "description",
        "image url",
        "specialty",
      ],
      [
        "Jane Doe Law",
        "TX-123456",
        "123 Main St",
        "Austin",
        "TX",
        "78701",
        "https://janedoelaw.com",
        "(512) 555-0199",
        "Products Liability: 25%; Trucking Accident: 25%; Wrongful Death: 25%; Litigation: 25%",
        "English; Spanish",
        "Super Lawyers 2024",
        "Trial lawyer with 15+ years experience.",
        "State Bar of Texas; AAJ",
        "J.D., UT Austin",
        "AAJ Trucking Conference 2023",
        "Plaintiff Strategies in Product Cases",
        "Focused on complex product liability and catastrophic injury matters.",
        "https://images.example.com/jane-doe-law.jpg",
        "",
      ],
      [
        "Dr. John Smith",
        "",
        "456 2nd Ave",
        "Seattle",
        "WA",
        "98101",
        "https://smithclinic.com",
        "(206) 555-0123",
        "",
        "English",
        "",
        "",
        "",
        "",
        "",
        "",
        "Board-certified cardiologist focused on complex cardiac care.",
        "https://images.example.com/smith-md.png",
        "Cardiology",
      ],
    ];
    const csvContent = sampleData
      .map((row) =>
        row.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = "sample-import.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleFileChange = (selectedFile) => {
    if (selectedFile && /\.csv$/i.test(selectedFile.name)) {
      setFile(selectedFile);
      setError("");
    } else {
      setError("Please select a valid CSV file (.csv).");
    }
  };

  const onDrop = useCallback((event) => {
    event.preventDefault();
    handleFileChange(event.dataTransfer.files?.[0]);
  }, []);
  const onDragOver = useCallback((event) => event.preventDefault(), []);

  // ---- Header normalization & duplicate handling
  const canonicalHeader = (h) => {
    const raw = String(h || "").trim().toLowerCase();
    const norm = raw.replace(/\s+/g, " ").replace(/[_\-]+/g, " ");

    // common aliases -> canonical keys used in mapping
    if (norm === "zipcode" || norm === "zip code") return "zip";
    if (norm === "street" || norm === "streetaddress") return "street address";
    if (norm === "practice_areas") return "practice areas";
    if (norm === "speaking engagements" || norm === "speaking_engagements")
      return "speaking engagements";
    if (norm === "work experience" || norm === "work_experience")
      return "work experience";

    // image url aliases
    if (
      [
        "imageurl",
        "image link",
        "image links",
        "imagelink",
        "image",
        "image address",
        "logo",
        "logo url",
        "logourl",
        "photo",
        "photo url",
        "photourl",
        "picture",
        "picture url",
      ].includes(norm)
    )
      return "image url";

    return norm;
  };

  const collapseDupes = (row) => {
    const out = { ...row };
    for (const k of Object.keys(row)) {
      const m = /^(.+?)__dup(\d+)$/.exec(k);
      if (!m) continue;
      const base = m[1];
      const val = row[k];
      delete out[k];
      if (val == null || String(val).trim() === "") continue;

      if (out[base] == null || String(out[base]).trim() === "") {
        out[base] = val;
      } else if (base === "practice areas") {
        out[base] = [out[base], val].filter(Boolean).join("; ");
      }
    }
    return out;
  };

  // ---- Field extractors
  const getStr = (obj, ...keys) => {
    for (const k of keys) {
      const v = obj[k];
      if (v != null && String(v).trim() !== "") return String(v).trim();
    }
    return "";
  };

  const buildImageUrl = (r) => {
    const url = getStr(
      r,
      "image url",
      "Image URL",
      "image_url",
      "image",
      "logo",
      "logo url",
      "image link",
      "Image Link",
      "photourl",
      "photo url",
      "photo",
      "picture",
      "picture url"
    );
    return /^https?:\/\//i.test(url) ? url : "";
  };

  // ------- Normalizers -------
  const STATE_MAP = {
    "alabama":"AL","alaska":"AK","arizona":"AZ","arkansas":"AR","california":"CA","colorado":"CO",
    "connecticut":"CT","delaware":"DE","florida":"FL","georgia":"GA","hawaii":"HI","idaho":"ID",
    "illinois":"IL","indiana":"IN","iowa":"IA","kansas":"KS","kentucky":"KY","louisiana":"LA",
    "maine":"ME","maryland":"MD","massachusetts":"MA","michigan":"MI","minnesota":"MN","mississippi":"MS",
    "missouri":"MO","montana":"MT","nebraska":"NE","nevada":"NV","new hampshire":"NH","new jersey":"NJ",
    "new mexico":"NM","new york":"NY","north carolina":"NC","north dakota":"ND","ohio":"OH","oklahoma":"OK",
    "oregon":"OR","pennsylvania":"PA","rhode island":"RI","south carolina":"SC","south dakota":"SD",
    "tennessee":"TN","texas":"TX","utah":"UT","vermont":"VT","virginia":"VA","washington":"WA",
    "west virginia":"WV","wisconsin":"WI","wyoming":"WY","district of columbia":"DC"
  };

  const normalizeState = (s) => {
    const v = String(s || "").trim();
    if (!v) return "";
    if (/^[A-Za-z]{2}$/.test(v)) return v.toUpperCase();
    const m = STATE_MAP[v.toLowerCase()];
    return m || "";
  };

  const normalizePhone = (p) => {
    const digits = String(p || "").replace(/\D/g, "");
    if (!digits) return "";
    // US-friendly: 10 -> +1..., 11 starting with 1 -> +..., else just +digits
    const withPlus =
      digits.startsWith("1") && digits.length === 11
        ? `+${digits}`
        : digits.length === 10
        ? `+1${digits}`
        : `+${digits}`;
    return withPlus;
  };

  // ---- Mapping row -> payloads ----

  // Business (lawyer) payload
  const rowToBusiness = (r, catId) => {
    const name = getStr(r, "name", "Name");
    const license = getStr(r, "license", "licence", "License", "Licence");

    const street_address = getStr(r, "street address", "Street Address", "street_address", "address");
    const city = getStr(r, "city", "City");
    const state = getStr(r, "state", "State");

    const normalizeZip = (z) => {
      const digits = String(z || "").replace(/\D/g, "");
      if (digits.length === 5) return digits;
      if (digits.length === 9) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
      return "";
    };
    const zip = normalizeZip(getStr(r, "zip", "Zip", "zipcode", "zip code"));

    const website = getStr(r, "website", "Website");
    const phone = getStr(r, "phone", "Phone");
    const image_url = buildImageUrl(r);

    const practice_areas = getStr(r, "practice areas", "Practice Areas", "practice_areas");
    const honors = getStr(r, "honors", "Honors");
    const work_experience = getStr(r, "work experience", "Work Experience", "work_experience");
    const associations = getStr(r, "associations", "Associations");
    const education = getStr(r, "education", "Education");
    const speaking_engagements = getStr(r, "speaking engagements", "Speaking Engagements", "speaking_engagements");
    const publications = getStr(r, "publications", "Publications");
    const language = getStr(r, "language", "Language");
    const description = getStr(r, "description", "Description");

    return {
      name,
      license,
      street_address,
      city,
      state,
      zip,
      description,
      practice_areas,
      honors,
      work_experience,
      associations,
      education,
      speaking_engagements,
      publications,
      language,
      website,
      phone,
      image_url,
      category_id: Number(catId),
      status: "active",
      is_premium: false,
    };
  };

  // Doctor payload (maps CSV -> doctor fields)
  const rowToDoctor = (r, catId) => {
    const provider_name = getStr(r, "name", "Name") || getStr(r, "provider name", "provider_name");
    const specialty =
      getStr(r, "specialty", "Specialty") ||
      getStr(r, "practice areas", "Practice Areas", "practice_areas");

    const license = getStr(r, "license", "licence", "License", "Licence");

    const street_address = getStr(r, "street address", "Street Address", "street_address", "address");
    const city = getStr(r, "city", "City");
    const state = getStr(r, "state", "State");

    const normalizeZip = (z) => {
      const digits = String(z || "").replace(/\D/g, "");
      if (digits.length === 5) return digits;
      if (digits.length === 9) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
      return "";
    };
    const zip = normalizeZip(getStr(r, "zip", "Zip", "zipcode", "zip code"));

    const website = getStr(r, "website", "Website");
    const phone = getStr(r, "phone", "Phone");
    const image_url = buildImageUrl(r);

    const language = getStr(r, "language", "Language");
    const honors = getStr(r, "honors", "Honors");
    const work_experience = getStr(r, "work experience", "Work Experience", "work_experience");
    const associations = getStr(r, "associations", "Associations");
    const education = getStr(r, "education", "Education");
    const speaking_engagements = getStr(r, "speaking engagements", "Speaking Engagements", "speaking_engagements");
    const publications = getStr(r, "publications", "Publications");
    const description = getStr(r, "description", "Description");

    return {
      provider_name,
      specialty,
      license,
      street_address,
      city,
      state,
      zip,
      description,
      language,
      honors,
      work_experience,
      associations,
      education,
      speaking_engagements,
      publications,
      website,
      phone,
      image_url,
      category_id: Number(catId), // keep if your doctors also use categories; else drop this
      status: "active",
      is_premium: false,
    };
  };

  const extractErr = (err) => {
    const st = err?.response?.status;
    if (st === 401 || st === 403 || st === 302) {
      return "Your session expired or you don't have permission to bulk import. Please sign in as an admin and try again.";
    }
    if (err?.code === "ECONNABORTED") {
      return "Network/Server timeout while uploading this batch. You can retry.";
    }
    const data = err?.response?.data;
    if (typeof data === "string") return data;
    if (Array.isArray(data)) return data.join(", ");
    if (data && typeof data === "object") {
      try {
        return Object.values(data).flat().join(" ");
      } catch {}
    }
    return err?.message || "Unexpected error";
  };

  // ---- Streaming parse & batched upload
  const startImport = async () => {
    if (!file) {
      setError("Please select a CSV file first.");
      return;
    }
    if (!selectedCategoryId) {
      setError("Please select a category for this import.");
      return;
    }

    // reset
    setError("");
    setPreviewRows([]);
    setProcessedCount(0);
    setUploadedCount(0);
    setSuccessCount(0);
    previewCountRef.current = 0;
    abortedRef.current = false;
    parserRef.current = null;
    headerSeenRef.current = {};
    lastActivityRef.current = Date.now();

    setStatus("parsing");

    const batch = [];
    let uploaded = 0;
    let processed = 0;

    const flushBatch = async (isFinal = false) => {
      if (!batch.length) return;
      setStatus("importing");
      try {
        // Switch API based on type
        const result =
          importType === "doctor"
            ? await bulkCreateDoctors([...batch], { recalc: isFinal ? 1 : 0 })
            : await bulkCreateBusinesses([...batch], { recalc: isFinal ? 1 : 0 });

        const created =
          typeof result?.created === "number" ? result.created : batch.length;
        uploaded += created;
        setUploadedCount(uploaded);
        batch.length = 0;
        lastActivityRef.current = Date.now();
      } catch (e) {
        abortedRef.current = true;
        setStatus("error");
        setError(extractErr(e) || "Failed to upload a batch.");
        throw e;
      } finally {
        if (!abortedRef.current) setStatus("parsing");
      }
    };

    const parseOptions = (useWorker) => ({
      header: true,
      skipEmptyLines: true,
      worker: useWorker,
      chunkSize: CHUNK_SIZE_BYTES,
      transformHeader: (h) => {
        const key = canonicalHeader(h);
        const seen = headerSeenRef.current;
        if (!seen[key]) {
          seen[key] = 1;
          return key;
        }
        seen[key] += 1;
        return `${key}__dup${seen[key]}`;
      },
      chunk: async (results, parser) => {
        parserRef.current = parser;
        if (abortedRef.current) {
          parser.abort();
          return;
        }

        const rows = (results.data || []).map(collapseDupes);
        for (const r of rows) {
          const item =
            importType === "doctor"
              ? rowToDoctor(r, selectedCategoryId)
              : rowToBusiness(r, selectedCategoryId);

          const nameLike =
            importType === "doctor" ? item.provider_name : item.name;
          if (!nameLike) {
            processed += 1;
            lastActivityRef.current = Date.now();
            continue;
          }

          // ---- Preview (uses unmodified values)
          if (previewCountRef.current < PREVIEW_LIMIT) {
            previewCountRef.current += 1;
            setPreviewRows((prev) => [
              ...prev,
              {
                name: nameLike,
                street_address: item.street_address || "",
                city: item.city || "",
                state: item.state || "",
                image_url: item.image_url || "",
              },
            ]);
          }

          // ---- Final normalizations BEFORE upload
          item.state = normalizeState(item.state);
          if (item.phone) item.phone = normalizePhone(item.phone);
          if (!item.image_url) delete item.image_url; // don't send empty-string URL

          batch.push(item);
          processed += 1;
          lastActivityRef.current = Date.now();

          if (batch.length >= BATCH_SIZE) {
            parser.pause();
            try {
              await flushBatch(false);
            } catch {
              parser.abort();
              return;
            }
            await new Promise((r) => setTimeout(r, 0));
            parser.resume();
          }

          if (processed % PROGRESS_EVERY === 0) setProcessedCount(processed);
        }
      },
      complete: async () => {
        try {
          setProcessedCount(processed);
          await flushBatch(true); // recalc=1 on final
          setSuccessCount(uploaded);
          if (!abortedRef.current) setStatus("success");
        } catch {
          /* handled in flush */
        }
      },
      error: (err) => {
        if (useWorker && /not implemented/i.test(String(err?.message || ""))) {
          setTimeout(() => {
            Papa.parse(file, parseOptions(false));
          }, 0);
          return;
        }
        setStatus("error");
        setError(err?.message || "Failed to parse CSV.");
      },
    });

    Papa.parse(file, parseOptions(USE_WORKER));
  };

  // Watchdog for stalls (>90s idle)
  useEffect(() => {
    if (status !== "parsing" && status !== "importing") return;
    const id = setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs > 90_000 && !abortedRef.current) {
        setStatus("error");
        setError(
          "Upload appears stalled (no progress for 90s). Please retry; the last finished batch was saved."
        );
        try {
          parserRef.current?.abort();
        } catch {}
      }
    }, 10_000);
    return () => clearInterval(id);
  }, [status]);

  const resetState = () => {
    setFile(null);
    setStatus("idle");
    setError("");
    setPreviewRows([]);
    setProcessedCount(0);
    setUploadedCount(0);
    setSuccessCount(0);
    previewCountRef.current = 0;
    abortedRef.current = false;
    parserRef.current = null;
    headerSeenRef.current = {};
  };

  const truncate = (s, n = 48) => {
    const str = String(s || "");
    return str.length > n ? str.slice(0, n - 1) + "…" : str;
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="p-8">
            <Building className="w-16 h-16 text-blue-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Sign In Required
            </h2>
            <p className="text-gray-600 mb-6">
              You need to be signed in to bulk upload {importType === "doctor" ? "doctors" : "businesses"}.
            </p>
            <Button
              onClick={() =>
                (window.location.href = `/login?next=${encodeURIComponent(
                  window.location.href
                )}`)}
              className="w-full"
            >
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="p-8">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Import Complete
            </h2>
            <p className="text-gray-600 mb-6">
              Successfully imported {successCount} {importType === "doctor" ? "doctors" : "businesses"}.
            </p>
            <div className="flex flex-col gap-3">
              <Button onClick={resetState}>Upload Another File</Button>
              <Link
                to={createPageUrl(
                  user?.user_type === "admin"
                    ? "admindashboard"
                    : "OwnerDashboard"
                )}
              >
                <Button variant="outline" className="w-full">
                  Go to Dashboard
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link
          to={createPageUrl(
            user?.user_type === "admin" ? "admindashboard" : "OwnerDashboard"
          )}
        >
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">
              Bulk Import {importType === "doctor" ? "Doctors" : "Businesses"}
            </CardTitle>
            <p className="text-gray-500">
              Upload a CSV file to add multiple {importType === "doctor" ? "doctors" : "businesses"} at once. Large files
              are streamed and uploaded in batches.
            </p>
          </CardHeader>
          <CardContent>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-6">
              {/* Import Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="import-type">Import Type *</Label>
                  <div className="mt-2">
                    <select
                      id="import-type"
                      className="w-full h-10 rounded-md border px-3 text-sm"
                      value={importType}
                      onChange={(e) => setImportType(e.target.value)}
                    >
                      <option value="business">Business (Lawyer)</option>
                      <option value="doctor">Doctor</option>
                    </select>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Doctor import uses the same CSV; it maps <code>name</code> to <code>provider_name</code> and
                    <code> practice areas</code> to <code>specialty</code> if <code>specialty</code> isn’t provided.
                  </p>
                </div>

                {/* Category */}
                <div>
                  <Label htmlFor="bulk-category">Category *</Label>
                  <div className="mt-2">
                    <select
                      id="bulk-category"
                      className="w-full h-10 rounded-md border px-3 text-sm"
                      value={selectedCategoryId}
                      onChange={(e) => setSelectedCategoryId(e.target.value)}
                    >
                      <option value="">— Select a category —</option>
                      {categories.map((c) => (
                        <option key={c.id} value={String(c.id)}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    The entire CSV will be imported into this category.
                  </p>
                </div>
              </div>

              {/* Format + sample */}
              <div>
                <Label>CSV File Format</Label>
                <p className="text-sm text-gray-500 mb-2">
                  Required: <code>name</code>. Optional (any casing):{" "}
                  <code>license</code>, <code>street address</code>,{" "}
                  <code>city</code>, <code>state</code>, <code>zip</code>,{" "}
                  <code>website</code>, <code>phone</code>,{" "}
                  <code>practice areas</code>, <code>specialty</code>,{" "}
                  <code>language</code>, <code>honors</code>,{" "}
                  <code>work experience</code>, <code>associations</code>,{" "}
                  <code>education</code>, <code>speaking engagements</code>,{" "}
                  <code>publications</code>, <code>description</code>,{" "}
                  <code>image url</code>.
                </p>
                <Button
                  variant="link"
                  onClick={downloadSampleCSV}
                  className="text-sm text-blue-600 hover:underline p-0 h-auto"
                >
                  <Download className="w-4 h-4 mr-1" /> Download sample.csv
                </Button>
              </div>

              {/* Dropzone */}
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center cursor-pointer hover:border-blue-500 transition-colors"
                onDrop={onDrop}
                onDragOver={onDragOver}
                onClick={() => document.getElementById("file-upload")?.click()}
              >
                {importType === "doctor" ? (
                  <Stethoscope className="mx-auto h-12 w-12 text-gray-400" />
                ) : (
                  <Upload className="mx-auto h-12 w-12 text-gray-400" />
                )}
                <p className="mt-2 text-gray-600">
                  {file
                    ? `Selected: ${file.name}`
                    : "Drag & drop your CSV file here, or click to select"}
                </p>
                <input
                  type="file"
                  className="hidden"
                  id="file-upload"
                  accept=".csv,text/csv"
                  onChange={(e) => handleFileChange(e.target.files?.[0])}
                />
                <Button as="span" variant="link" className="mt-2">
                  Browse files
                </Button>
              </div>

              {/* Start */}
              <Button
                onClick={startImport}
                disabled={
                  !file ||
                  !selectedCategoryId ||
                  status === "parsing" ||
                  status === "importing"
                }
                className="w-full"
              >
                {(status === "parsing" || status === "importing") && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {status === "parsing"
                  ? "Reading file…"
                  : status === "importing"
                  ? `Uploading… (${uploadedCount} / ${processedCount})`
                  : "Upload & Import"}
              </Button>

              {/* Preview */}
              {previewRows.length > 0 && (
                <div>
                  <h3 className="font-semibold text-lg mb-2">
                    Preview (first {PREVIEW_LIMIT} rows)
                  </h3>
                  <div className="border rounded-lg max-h-96 overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-gray-50">
                        <TableRow>
                          <TableHead>{importType === "doctor" ? "Provider" : "Name"}</TableHead>
                          <TableHead>Street</TableHead>
                          <TableHead>City</TableHead>
                          <TableHead>State</TableHead>
                          <TableHead>Image URL</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewRows.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell>{r.name}</TableCell>
                            <TableCell>{r.street_address || "—"}</TableCell>
                            <TableCell>{r.city || "—"}</TableCell>
                            <TableCell>{r.state || "—"}</TableCell>
                            <TableCell title={r.image_url || ""}>
                              {r.image_url ? truncate(r.image_url) : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {(status === "parsing" || status === "importing") && (
                    <p className="text-xs text-gray-500 mt-2">
                      Processed: {processedCount} • Uploaded: {uploadedCount}
                    </p>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
