import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Briefcase, Star, Folder, AlertCircle, Clock, Upload, Settings } from "lucide-react";

// APIs
import { me as getMe, countUsers, countPendingUsers } from "@/api/users";
import { countBusinesses, countPendingBusinesses } from "@/api/businesses";
import { countReviews, countPendingReviews } from "@/api/reviews";
import { countCategories } from "@/api/categories";
import { countDoctors, countPendingDoctors } from "@/api/doctors";

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ users: 0, businesses: 0, reviews: 0, categories: 0 });
  const [pendingCounts, setPendingCounts] = useState({ users: 0, businesses: 0, reviews: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const isAdmin = (u) => u?.user_type === "admin" || u?.role === "admin" || Boolean(u?.is_staff);

  useEffect(() => {
    const run = async () => {
      try {
        const user = await getMe().catch(() => null);
        if (!user || !isAdmin(user)) {
          setError("You must be an administrator to view this page.");
          navigate(createPageUrl("Home"));
          return;
        }

        const [
          usersTotal,
          businessesTotal,
          doctorsTotal,
          reviewsTotal,
          categoriesTotal,
          usersPending,
          businessesPending,
          doctorsPending,
          reviewsPending,
        ] = await Promise.all([
          countUsers(),
          countBusinesses(),
          countDoctors(),
          countReviews(),
          countCategories(),
          countPendingUsers(),
          countPendingBusinesses(),
          countPendingDoctors(),
          countPendingReviews(),
        ]);

        // Combine doctors into businesses for dashboard purposes
        const combinedBusinesses = Number(businessesTotal || 0) + Number(doctorsTotal || 0);
        const combinedBusinessesPending = Number(businessesPending || 0) + Number(doctorsPending || 0);

        setStats({
          users: Number(usersTotal || 0),
          businesses: combinedBusinesses,
          reviews: Number(reviewsTotal || 0),
          categories: Number(categoriesTotal || 0),
        });

        setPendingCounts({
          users: Number(usersPending || 0),
          businesses: combinedBusinessesPending,
          reviews: Number(reviewsPending || 0),
        });
      } catch (err) {
        console.error(err);
        setError("You must be an administrator to view this page.");
        navigate(createPageUrl("Home"));
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [navigate]);

  if (loading) return <div className="p-8">Loading dashboard...</div>;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
        <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
        <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
        <p className="text-gray-600 mb-4">{error}</p>
        <Button onClick={() => navigate(createPageUrl("Home"))}>Go to Homepage</Button>
      </div>
    );
  }

  const adminNavItems = [
    { title: "Manage Users", icon: Users, link: "adminmanageusers", count: stats.users },
    // Single combined “Manage Businesses” (includes doctors)
    { title: "Manage Businesses", icon: Briefcase, link: "adminmanagebusinesses", count: stats.businesses },
    { title: "Manage Reviews", icon: Star, link: "adminmanagereviews", count: stats.reviews },
    { title: "Manage Categories", icon: Folder, link: "adminmanagecategories", count: stats.categories },
    { title: "SEO Meta Manager", icon: Settings, link: "AdminMetaManager", count: 0 },
  ];

  // Pending approvals: combine businesses + doctors into “New Businesses”
  const totalPending = pendingCounts.users + pendingCounts.businesses + pendingCounts.reviews;

  return (
    <div className="p-4 md:p-8 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <div className="flex gap-3">
            <Link to={createPageUrl("BulkUpload")}>
              <Button variant="outline">
                <Upload className="w-4 h-4 mr-2" />
                Bulk Import Businesses
              </Button>
            </Link>
            <Link to={createPageUrl("BulkUploadDoctors")}>
              <Button variant="outline">
                <Upload className="w-4 h-4 mr-2" />
                Bulk Import Doctors
              </Button>
            </Link>
          </div>
        </div>

        {totalPending > 0 && (
          <Card className="mb-6 bg-yellow-50 border-yellow-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-yellow-800">
                <Clock className="w-5 h-5" />
                Pending Approvals
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link to={createPageUrl("adminmanageusers")} className="block">
                <div className="p-4 rounded-lg hover:bg-yellow-100 transition-colors duration-200">
                  <p className="text-sm font-medium text-yellow-700">New Users</p>
                  <p className="text-2xl font-bold text-yellow-900">{pendingCounts.users}</p>
                </div>
              </Link>

              {/* Combined businesses + doctors */}
              <Link to={createPageUrl("adminmanagebusinesses")} className="block">
                <div className="p-4 rounded-lg hover:bg-yellow-100 transition-colors duration-200">
                  <p className="text-sm font-medium text-yellow-700">New Businesses (incl. Doctors)</p>
                  <p className="text-2xl font-bold text-yellow-900">{pendingCounts.businesses}</p>
                </div>
              </Link>

              <Link to={createPageUrl("adminmanagereviews")} className="block">
                <div className="p-4 rounded-lg hover:bg-yellow-100 transition-colors duration-200">
                  <p className="text-sm font-medium text-yellow-700">New Reviews</p>
                  <p className="text-2xl font-bold text-yellow-900">{pendingCounts.reviews}</p>
                </div>
              </Link>
            </CardContent>
          </Card>
        )}

        <h2 className="text-xl font-semibold text-gray-800 mb-4">Site Management</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
          {adminNavItems.map((item) => (
            <Card key={item.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{item.title}</CardTitle>
                <item.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{item.count}</div>
                <Link
                  to={createPageUrl(item.link)}
                  className="text-xs text-muted-foreground mt-1 block hover:underline"
                >
                  Go to {item.title} &rarr;
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
