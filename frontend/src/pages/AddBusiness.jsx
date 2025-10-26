import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Building, CheckCircle, AlertCircle, ArrowLeft, PlusCircle } from "lucide-react";

// ✅ APIs
import { me as getMe } from "@/api/users";
import { listCategories, createCategory } from "@/api/categories";
import { createBusiness } from "@/api/businesses";
import { createDoctor } from "@/api/doctors";

/** Heuristics to detect whether a category is a Doctor/Provider vertical. */
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

/** Map the unified form to Doctor payload (with simple works_for_url) */
const toDoctorPayload = (f) => ({
  // Identity
  provider_name: f.name || "",
  specialty: f.practice_areas || "",

  // Profile
  description: f.description || "",
  insurances: "",
  popular_visit_reasons: "",

  // Address
  street_address: f.street_address || "",
  city: f.city || "",
  state: f.state || "",
  zip: f.zip || "",

  // Practice & education
  practice_names: "",
  educations: f.education || "",

  // Misc
  languages: f.language || "",
  gender: "",
  npi_number: f.license || "",

  // Contact
  website: f.website || "",
  phone: f.phone || "",
  image_url: f.image_url || "",
  email: f.email || "",

  // Category & “working with/for” URL
  category_id: Number(f.category_id),
  works_for_url: f.works_for_url || f.works_for || "",
});

export default function AddBusinessPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  // Form (adds works_for_url + email)
  const [formData, setFormData] = useState({
    // identity
    name: "",
    license: "",
    // relations
    category_id: "",
    // simple url
    works_for_url: "",
    // address
    street_address: "",
    city: "",
    state: "",
    zip: "",
    // profile
    description: "",
    practice_areas: "",
    honors: "",
    work_experience: "",
    associations: "",
    education: "",
    speaking_engagements: "",
    publications: "",
    language: "",
    // contact
    website: "",
    phone: "",
    image_url: "",
    email: "",
  });

  // Add Category dialog state
  const [showAddCategoryDialog, setShowAddCategoryDialog] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryDescription, setNewCategoryDescription] = useState("");
  const [newCategoryParent, setNewCategoryParent] = useState("none");
  const [newCategoryError, setNewCategoryError] = useState("");
  const [isAddingCategory, setIsAddingCategory] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [u, cats] = await Promise.all([getMe().catch(() => null), listCategories()]);
      setUser(u);
      setCategories(cats || []);
    } catch (err) {
      console.error("Error loading data:", err);
      try {
        const cats = await listCategories();
        setCategories(cats || []);
      } catch (catErr) {
        console.error("Error fetching categories:", catErr);
      }
    }
  };

  const selectedCategory = useMemo(
    () => categories.find((c) => String(c.id) === String(formData.category_id)),
    [categories, formData.category_id]
  );
  const isDoctorCat = useMemo(() => isDoctorCategory(selectedCategory), [selectedCategory]);

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  const handleCategoryChange = (value) => {
    if (value === "add_new") {
      setShowAddCategoryDialog(true);
      return;
    }
    handleInputChange("category_id", value);
  };

  const labelForCategory = (cat) => {
    return cat.full_slug ? cat.full_slug.replaceAll("/", " / ") : cat.name;
  };

  const handleSaveCategory = async () => {
    if (!newCategoryName.trim()) {
      setNewCategoryError("Category name cannot be empty.");
      return;
    }
    setIsAddingCategory(true);
    setNewCategoryError("");
    try {
      const payload = {
        name: newCategoryName.trim(),
        description: newCategoryDescription.trim() || undefined,
      };

      if (newCategoryParent !== "none") {
        payload.parent = Number(newCategoryParent);
      }

      const newCat = await createCategory(payload);

      const updatedCats = await listCategories();
      setCategories(updatedCats || []);
      handleInputChange("category_id", String(newCat.id));

      setShowAddCategoryDialog(false);
      setNewCategoryName("");
      setNewCategoryDescription("");
      setNewCategoryParent("none");
    } catch (err) {
      console.error("Error creating category:", err);
      const msg =
        (err?.response?.data?.name || err?.message || "").toString().toLowerCase();
      const friendly =
        msg.includes("exists") || msg.includes("duplicate")
          ? "A category with this name already exists. Please choose a different name."
          : "Failed to create category. Please try again.";
      setNewCategoryError(friendly);
    } finally {
      setIsAddingCategory(false);
    }
  };

  const handleLogin = () => {
    navigate(createPageUrl("Login"));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!user) {
      setError("Please sign in to add a listing");
      return;
    }
    if (user.status && user.status !== "active") {
      setError(
        "Your account is pending approval. You cannot add a new listing until your account has been activated by an administrator."
      );
      return;
    }
    if (!formData.name || !formData.category_id) {
      setError("Please fill in all required fields");
      return;
    }

    setLoading(true);
    try {
      if (isDoctorCat) {
        const doctorPayload = toDoctorPayload(formData);
        await createDoctor(doctorPayload);
      } else {
        const businessPayload = {
          // identity
          name: formData.name,
          license: formData.license || "",
          // relations
          category_id: Number(formData.category_id),
          // simple url
          works_for_url: formData.works_for_url || "",
          // address
          street_address: formData.street_address || "",
          city: formData.city || "",
          state: formData.state || "",
          zip: formData.zip || "",
          // profile
          description: formData.description || "",
          practice_areas: formData.practice_areas || "",
          honors: formData.honors || "",
          work_experience: formData.work_experience || "",
          associations: formData.associations || "",
          education: formData.education || "",
          speaking_engagements: formData.speaking_engagements || "",
          publications: formData.publications || "",
          language: formData.language || "",
          // contact
          website: formData.website || "",
          phone: formData.phone || "",
          image_url: formData.image_url || "",
          email: formData.email || "",
        };
        await createBusiness(businessPayload);
      }

      setSuccess(true);
      setTimeout(() => {
        window.location.href = createPageUrl("Home");
      }, 1600);
    } catch (err) {
      console.error("Error adding listing:", err);
      const apiErr =
        (err?.response?.data &&
          (err.response.data.detail ||
            Object.values(err.response.data).flat().join(" "))) ||
        "Failed to add listing. Please try again.";
      setError(apiErr);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <Building className="w-16 h-16 text-blue-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Sign In Required</h2>
            <p className="text-gray-600 mb-6">
              You need to create an account and sign in to add a listing to MightyRankings.com.
              This helps us maintain the quality and authenticity of our directory.
            </p>
            <div className="space-y-3">
              <Button onClick={handleLogin} className="w-full bg-blue-600 hover:bg-blue-700">
                Create Account / Sign In
              </Button>
              <Button
                variant="outline"
                onClick={() => (window.location.href = createPageUrl("Home"))}
                className="w-full"
              >
                Browse Without Account
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-4">Sign in is free and takes just seconds</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              {isDoctorCat ? "Provider Added!" : "Business Added!"}
            </h2>
            <p className="text-gray-600 mb-6">
              Your listing has been successfully added to MightyRankings.com
            </p>
            <div className="animate-pulse text-sm text-gray-500">Redirecting to home page...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <Button variant="ghost" onClick={() => navigate(createPageUrl("Home"))} className="mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {isDoctorCat ? "Add a Provider" : "Add a Business"}
            </h1>
            <p className="text-gray-600">
              Help others discover great {isDoctorCat ? "providers" : "businesses"} by adding them to our platform
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="w-5 h-5" />
                {isDoctorCat ? "Provider Information" : "Business Information"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {/* Name + License / NPI */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="name">{isDoctorCat ? "Provider Name *" : "Business Name *"}</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => handleInputChange("name", e.target.value)}
                      placeholder={isDoctorCat ? "e.g., Jane Doe, MD" : "Enter business name"}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="license">{isDoctorCat ? "NPI Number" : "License"}</Label>
                    <Input
                      id="license"
                      value={formData.license}
                      onChange={(e) => handleInputChange("license", e.target.value)}
                      placeholder={isDoctorCat ? "e.g., 1234567890" : "e.g., Bar #123456"}
                    />
                  </div>
                </div>

                {/* Category */}
                <div className="space-y-2">
                  <Label htmlFor="category">Category *</Label>
                  <Select value={formData.category_id} onValueChange={handleCategoryChange} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={String(cat.id)}>
                          {labelForCategory(cat)}
                        </SelectItem>
                      ))}
                      <SelectSeparator />
                      <SelectItem value="add_new">
                        <div className="flex items-center gap-2 text-blue-600">
                          <PlusCircle className="w-4 h-4" />
                          <span>Add New Category</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* “Working with/for” URL + Email */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="works_for_url">Working with/for (Link URL)</Label>
                    <Input
                      id="works_for_url"
                      type="url"
                      value={formData.works_for_url}
                      onChange={(e) => handleInputChange("works_for_url", e.target.value)}
                      placeholder="https://clinic-or-firm.example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email (optional)</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleInputChange("email", e.target.value)}
                      placeholder="contact@example.com"
                    />
                  </div>
                </div>

                {/* Address */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="street_address">Street Address</Label>
                    <Input
                      id="street_address"
                      value={formData.street_address}
                      onChange={(e) => handleInputChange("street_address", e.target.value)}
                      placeholder="123 Main St"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={(e) => handleInputChange("city", e.target.value)}
                      placeholder="Austin"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      value={formData.state}
                      onChange={(e) => handleInputChange("state", e.target.value)}
                      placeholder="TX"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="zip">Zip</Label>
                    <Input
                      id="zip"
                      value={formData.zip}
                      onChange={(e) => handleInputChange("zip", e.target.value)}
                      placeholder="78701"
                    />
                  </div>
                </div>

                {/* Contact */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="website">Website</Label>
                    <Input
                      id="website"
                      type="url"
                      value={formData.website}
                      onChange={(e) => handleInputChange("website", e.target.value)}
                      placeholder="https://example.com"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => handleInputChange("phone", e.target.value)}
                      placeholder="(555) 123-4567"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="image_url">Image URL (optional)</Label>
                    <Input
                      id="image_url"
                      type="url"
                      value={formData.image_url}
                      onChange={(e) => handleInputChange("image_url", e.target.value)}
                      placeholder="https://example.com/image.jpg"
                    />
                  </div>
                </div>

                {/* Profile fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="practice_areas">
                      {isDoctorCat ? "Specialty / Specialties" : "Practice Areas"}
                    </Label>
                    <Textarea
                      id="practice_areas"
                      value={formData.practice_areas}
                      onChange={(e) => handleInputChange("practice_areas", e.target.value)}
                      placeholder={
                        isDoctorCat
                          ? "e.g., Dermatology; Mohs surgery"
                          : "e.g., Litigation; Wrongful Death; Trucking Accidents"
                      }
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="language">{isDoctorCat ? "Languages" : "Language(s)"}</Label>
                    <Input
                      id="language"
                      value={formData.language}
                      onChange={(e) => handleInputChange("language", e.target.value)}
                      placeholder="e.g., English; Spanish"
                    />
                  </div>

                  {!isDoctorCat && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="honors">Honors</Label>
                        <Textarea
                          id="honors"
                          value={formData.honors}
                          onChange={(e) => handleInputChange("honors", e.target.value)}
                          rows={2}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="work_experience">Work Experience</Label>
                        <Textarea
                          id="work_experience"
                          value={formData.work_experience}
                          onChange={(e) => handleInputChange("work_experience", e.target.value)}
                          rows={2}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="associations">Associations</Label>
                        <Textarea
                          id="associations"
                          value={formData.associations}
                          onChange={(e) => handleInputChange("associations", e.target.value)}
                          rows={2}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="speaking_engagements">Speaking Engagements</Label>
                        <Textarea
                          id="speaking_engagements"
                          value={formData.speaking_engagements}
                          onChange={(e) => handleInputChange("speaking_engagements", e.target.value)}
                          rows={2}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="publications">Publications</Label>
                        <Textarea
                          id="publications"
                          value={formData.publications}
                          onChange={(e) => handleInputChange("publications", e.target.value)}
                          rows={2}
                        />
                      </div>
                    </>
                  )}

                  {/* Education visible for both */}
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="education">{isDoctorCat ? "Educations" : "Education"}</Label>
                    <Textarea
                      id="education"
                      value={formData.education}
                      onChange={(e) => handleInputChange("education", e.target.value)}
                      placeholder={isDoctorCat ? "e.g., MD, Residency, Fellowships" : ""}
                      rows={2}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => handleInputChange("description", e.target.value)}
                    placeholder={
                      isDoctorCat
                        ? "Describe this provider’s care, approach, or expertise…"
                        : "Describe what this business offers…"
                    }
                    rows={4}
                  />
                </div>

                <div className="flex gap-4 pt-6">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate(createPageUrl("Home"))}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading} className="flex-1 bg-blue-600 hover:bg-blue-700">
                    {loading ? (isDoctorCat ? "Adding Provider..." : "Adding Business...") : "Add Listing"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <div className="mt-8 p-4 bg-blue-50 rounded-lg">
            <h3 className="font-semibold text-blue-900 mb-2">What happens next?</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Your listing will be added to our directory</li>
              <li>• Users can start reviewing and rating it</li>
              <li>• You can claim ownership later to manage the listing</li>
              <li>• Consider upgrading to premium for enhanced visibility</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Add Category Dialog */}
      <Dialog
        open={showAddCategoryDialog}
        onOpenChange={(isOpen) => {
          setShowAddCategoryDialog(isOpen);
          if (!isOpen) {
            setNewCategoryName("");
            setNewCategoryDescription("");
            setNewCategoryParent("none");
            setNewCategoryError("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Add a New Category</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {newCategoryError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{newCategoryError}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="new-category-name">Category Name *</Label>
              <Input
                id="new-category-name"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="e.g., Lawyers, Personal Injury Lawyers, Dermatologists"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-category-parent">Parent Category (optional)</Label>
              <Select value={newCategoryParent} onValueChange={setNewCategoryParent}>
                <SelectTrigger id="new-category-parent">
                  <SelectValue placeholder="None (top-level)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (top-level)</SelectItem>
                  <SelectSeparator />
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={String(cat.id)}>
                      {labelForCategory(cat)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-category-desc">Description (optional)</Label>
              <Textarea
                id="new-category-desc"
                value={newCategoryDescription}
                onChange={(e) => setNewCategoryDescription(e.target.value)}
                placeholder="A brief description of this category."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddCategoryDialog(false)}
              disabled={isAddingCategory}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveCategory} disabled={isAddingCategory || !newCategoryName.trim()}>
              {isAddingCategory ? "Saving..." : "Save Category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
