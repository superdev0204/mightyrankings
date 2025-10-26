import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  me as getCurrentUser,        // <-- use same name you call
  login as loginWithRedirect,  // import alias
  logout as logoutWithRedirect // import alias
} from "@/api/users";
import {
  Star,
  Crown,
  Shield,
  Menu,
  X,
  LogOut,
  Settings,
  User as UserIcon,
  Building,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import CompareTray from "@/components/common/CompareTray";
import { CompareProvider } from "@/components/common/CompareProvider";
import Seo from "@/components/common/Seo";

export default function Layout({ children, currentPageName }) {
  if (currentPageName === "sitemap") {
    return <>{children}</>;
  }

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const userData = await getCurrentUser();
        setUser(userData);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleLogin = () => {
    // full redirect; upon return the SPA reloads and we refetch me()
    loginWithRedirect(window.location.href);
  };

  const handleLogout = () => {
    // redirect logout clears session cookie server-side, then returns
    logoutWithRedirect(window.location.origin);
  };

  const getUserTypeIcon = (userType) => {
    switch (userType) {
      case "admin":
        return <Shield className="w-4 h-4 text-red-500" />;
      case "owner":
        return <Building className="w-4 h-4 text-blue-500" />;
      default:
        return <UserIcon className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <CompareProvider>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        {/* Remove the default SEO from layout since individual pages will handle it */}
        <style>{`
          :root {
            --primary-navy: #1e293b;
            --accent-gold: #f59e0b;
            --premium-gradient: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          }

          .glass-effect {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
          }

          .premium-glow {
            box-shadow: 0 0 20px rgba(245, 158, 11, 0.3);
          }

          @keyframes fadeInUp {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          .animate-fade-in-up {
            animation: fadeInUp 0.6s ease-out;
          }
        `}</style>

        {/* Header */}
        <header className="glass-effect sticky top-0 z-50 border-b border-gray-200/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-40">
              {/* Logo */}
              <Link to={createPageUrl("Home")} className="flex items-center space-x-3">
                <img
                  src="/logo.png"
                  alt="MightyRankings.com"
                  className="h-36 w-auto"
                />
              </Link>

              {/* Desktop Navigation */}
              <div className="hidden md:flex items-center space-x-4">
                {!loading && (
                  <>
                    {user ? (
                      <>
                        <Link to={createPageUrl("AddBusiness")}>
                          <Button variant="outline" className="rounded-full">
                            Add Business
                          </Button>
                        </Link>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="relative rounded-full p-2">
                              <div className="w-8 h-8 bg-gradient-to-r from-red-500 to-orange-500 rounded-full flex items-center justify-center">
                                <span className="text-white font-semibold text-sm">
                                  {user.full_name?.[0] || 'U'}
                                </span>
                              </div>
                              {user.premium_membership && (
                                <Crown className="absolute -top-1 -right-1 w-4 h-4 text-yellow-500" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <div className="px-3 py-2">
                              <p className="font-medium">{user.full_name}</p>
                              <p className="text-sm text-gray-500">{user.email}</p>
                              <div className="flex items-center gap-2 mt-1">
                                {getUserTypeIcon(user.user_type)}
                                <Badge variant="secondary" className="text-xs">
                                  {user.user_type}
                                </Badge>
                                {user.premium_membership && (
                                  <Badge className="text-xs bg-gradient-to-r from-yellow-400 to-orange-400">
                                    Premium
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem>
                              <Link to={createPageUrl("Profile")} className="flex items-center w-full">
                                <UserIcon className="w-4 h-4 mr-2" />
                                Profile
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Link to={createPageUrl("Dashboard")} className="flex items-center w-full">
                                <TrendingUp className="w-4 h-4 mr-2" />
                                Dashboard
                              </Link>
                            </DropdownMenuItem>
                            {user.user_type === 'owner' && (
                              <DropdownMenuItem>
                                <Link to={createPageUrl("OwnerDashboard")} className="flex items-center w-full">
                                  <Building className="w-4 h-4 mr-2" />
                                  My Businesses
                                </Link>
                              </DropdownMenuItem>
                            )}
                            {user.user_type === 'admin' && (
                              <DropdownMenuItem>
                                <Link to={createPageUrl("admindashboard")} className="flex items-center w-full">
                                  <Shield className="w-4 h-4 mr-2" />
                                  Admin Dashboard
                                </Link>
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem>
                              <Link to={createPageUrl("Settings")} className="flex items-center w-full">
                                <Settings className="w-4 h-4 mr-2" />
                                Settings
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={handleLogout}>
                              <LogOut className="w-4 h-4 mr-2" />
                              Sign Out
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    ) : (
                      <Button onClick={handleLogin} className="rounded-full bg-red-600 hover:bg-red-700">
                        Sign In
                      </Button>
                    )}
                  </>
                )}
              </div>

              {/* Mobile menu button */}
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>
          </div>

          {/* Mobile Navigation */}
          {mobileMenuOpen && (
            <div className="md:hidden border-t border-gray-200">
              <div className="px-4 py-3 space-y-3">
                {user ? (
                  <>
                    <div className="flex items-center space-x-3 py-2">
                      <div className="w-10 h-10 bg-gradient-to-r from-red-500 to-orange-500 rounded-full flex items-center justify-center">
                        <span className="text-white font-semibold">
                          {user.full_name?.[0] || 'U'}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium">{user.full_name}</p>
                        <div className="flex items-center gap-2">
                          {getUserTypeIcon(user.user_type)}
                          <Badge variant="secondary" className="text-xs">
                            {user.user_type}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <Link to={createPageUrl("AddBusiness")} className="block py-2">
                      <Button variant="outline" className="w-full">
                        Add Business
                      </Button>
                    </Link>
                    <Link to={createPageUrl("Profile")} className="block py-2 text-gray-600">
                      Profile
                    </Link>
                    <Link to={createPageUrl("Dashboard")} className="block py-2 text-gray-600">
                      Dashboard
                    </Link>
                    {user.user_type === 'owner' && (
                      <Link to={createPageUrl("OwnerDashboard")} className="block py-2 text-gray-600">
                        My Businesses
                      </Link>
                    )}
                    {user.user_type === 'admin' && (
                      <Link to={createPageUrl("admindashboard")} className="block py-2 text-gray-600">
                        Admin Dashboard
                      </Link>
                    )}
                    <button onClick={handleLogout} className="block py-2 text-red-600 w-full text-left">
                      Sign Out
                    </button>
                  </>
                ) : (
                  <Button onClick={handleLogin} className="w-full">
                    Sign In
                  </Button>
                )}
              </div>
            </div>
          )}
        </header>

        {/* Main Content */}
        <main className="flex-1 pb-24"> {/* Added padding-bottom for tray */}
          {children}
        </main>

        <CompareTray />

        {/* Footer */}
        <footer className="bg-gray-900 text-white py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              <div>
                <div className="flex items-center space-x-2 mb-4">
                  <img
                    src="/logo.png"
                    alt="MightyRankings.com"
                    className="h-24 w-auto"
                  />
                </div>
                <p className="text-gray-400">
                  The ultimate platform to review and discover anything.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-4">For Users</h3>
                <ul className="space-y-2 text-gray-400">
                  <li><Link to={createPageUrl("Home")} className="hover:text-white">Browse Reviews</Link></li>
                  <li><Link to={createPageUrl("Search")} className="hover:text-white">Search</Link></li>
                  <li><Link to={createPageUrl("AddBusiness")} className="hover:text-white">Add Business</Link></li>
                  <li><Link to={createPageUrl("Crowdfund")} className="hover:text-white">Crowdfund a Business</Link></li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold mb-4">For Business</h3>
                <ul className="space-y-2 text-gray-400">
                  <li><Link to={createPageUrl("BusinessOwner")} className="hover:text-white">Claim Your Business</Link></li>
                  <li><Link to={createPageUrl("Premium")} className="hover:text-white">Premium Features</Link></li>
                  <li><Link to={createPageUrl("OwnerDashboard")} className="hover:text-white">Owner Dashboard</Link></li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold mb-4">Support</h3>
                <ul className="space-y-2 text-gray-400">
                  <li><a href="#" className="hover:text-white">Help Center</a></li>
                  <li><a href="#" className="hover:text-white">Contact Us</a></li>
                  <li><Link to={createPageUrl("TermsOfService")} className="hover:text-white">Terms of Service</Link></li>
                  <li><Link to={createPageUrl("sitemap")} className="hover:text-white">Sitemap</Link></li>
                </ul>
              </div>
            </div>
            <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
              <p>&copy; 2024 MightyRankings.com. All rights reserved.</p>
            </div>
          </div>
        </footer>
      </div>
    </CompareProvider>
  );
}
