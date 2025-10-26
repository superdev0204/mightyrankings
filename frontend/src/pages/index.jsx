import Layout from "./Layout.jsx";

import Home from "./Home";
import Search from "./Search";
import AddBusiness from "./AddBusiness";
import Compare from "./Compare";
import Category from "./Category";
import OwnerDashboard from "./OwnerDashboard";
import Premium from "./Premium";
import BusinessOwner from "./BusinessOwner";
import BulkUpload from "./BulkUpload";
import Profile from "./Profile";
import Settings from "./Settings";
import Dashboard from "./Dashboard";
import Crowdfund from "./Crowdfund";
import TermsOfService from "./TermsOfService";

// Admin pages
import AdminSetup from "./adminsetup";
import AdminDashboard from "./admindashboard";
import AdminManageUsers from "./adminmanageusers";
import AdminManageBusinesses from "./adminmanagebusinesses";
import AdminManageReviews from "./adminmanagereviews";
import AdminManageCategories from "./adminmanagecategories";

import Sitemap from "./sitemap";
import AdminMetaManager from "./AdminMetaManager";
import Business from "./business";

import { BrowserRouter as Router, Route, Routes, useLocation } from "react-router-dom";

const PAGES = {
  Home,
  Search,
  AddBusiness,
  Compare,
  Category,
  OwnerDashboard,
  Premium,
  BusinessOwner,
  BulkUpload,
  Profile,
  Settings,
  Dashboard,
  Crowdfund,
  TermsOfService,

  // keep keys as your route names
  adminsetup: AdminSetup,
  admindashboard: AdminDashboard,
  adminmanageusers: AdminManageUsers,
  adminmanagebusinesses: AdminManageBusinesses,
  adminmanagereviews: AdminManageReviews,
  adminmanagecategories: AdminManageCategories,

  sitemap: Sitemap,
  AdminMetaManager,
  business: Business,
};

function _getCurrentPage(url) {
  if (url.endsWith("/")) url = url.slice(0, -1);
  const segs = url.split("/").filter(Boolean);

  if (segs.length === 0) return "Home";

  if (segs[0]?.toLowerCase() === "business") return "business";
  if (segs[0]?.toLowerCase() === "doctor") return "doctor";

  const known = new Set(Object.keys(PAGES).map((k) => k.toLowerCase()));
  if (segs[0] && !known.has(segs[0].toLowerCase())) return "Category";
  if (segs[0]?.toLowerCase() === "category") return "Category";

  let urlLastPart = segs[segs.length - 1];
  if (urlLastPart.includes("?")) urlLastPart = urlLastPart.split("?")[0];

  const pageName =
    Object.keys(PAGES).find(
      (page) => page.toLowerCase() === urlLastPart.toLowerCase()
    ) || "Home";

  return pageName;
}

function PagesContent() {
  const location = useLocation();
  const currentPage = _getCurrentPage(location.pathname);

  return (
    <Layout currentPageName={currentPage}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/Home" element={<Home />} />
        <Route path="/Search" element={<Search />} />
        <Route path="/AddBusiness" element={<AddBusiness />} />
        <Route path="/Compare" element={<Compare />} />
        <Route path="/Category" element={<Category />} />
        <Route path="/OwnerDashboard" element={<OwnerDashboard />} />
        <Route path="/Premium" element={<Premium />} />
        <Route path="/BusinessOwner" element={<BusinessOwner />} />
        <Route path="/BulkUpload" element={<BulkUpload />} />
        <Route path="/Profile" element={<Profile />} />
        <Route path="/Settings" element={<Settings />} />
        <Route path="/Dashboard" element={<Dashboard />} />
        <Route path="/Crowdfund" element={<Crowdfund />} />
        <Route path="/TermsOfService" element={<TermsOfService />} />

        {/* Admin routes */}
        <Route path="/adminsetup" element={<AdminSetup />} />
        <Route path="/admindashboard" element={<AdminDashboard />} />
        <Route path="/adminmanageusers" element={<AdminManageUsers />} />
        <Route path="/adminmanagebusinesses" element={<AdminManageBusinesses />} />
        <Route path="/adminmanagereviews" element={<AdminManageReviews />} />
        <Route path="/adminmanagecategories" element={<AdminManageCategories />} />

        <Route path="/sitemap" element={<Sitemap />} />
        <Route path="/AdminMetaManager" element={<AdminMetaManager />} />

        {/* Business routes — no numeric-ID route; prefer category path */}
        <Route path="/business/:categorySlug/:slug" element={<Business />} />
        <Route path="/business/:slug" element={<Business />} />
        <Route path="/business/:id-:rest" element={<Business />} /> {/* legacy */}
        <Route path="/Business" element={<Business />} />           {/* legacy */}
        <Route path="/business/*" element={<Business />} />         {/* catch-all */}

        {/* Category routes */}
        <Route path="/Category/*" element={<Category />} />
        <Route path="/:categoryRoot" element={<Category />} />
        <Route path="/:categoryRoot/*" element={<Category />} />
      </Routes>
    </Layout>
  );
}

export default function Pages() {
  return (
    <Router>
      <PagesContent />
    </Router>
  );
}
