
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Search, Heart, Star, Gift } from 'lucide-react';
import Seo from "@/components/common/Seo";

export default function CrowdfundPage() {
    const [searchQuery, setSearchQuery] = useState("");

    const handleSearch = (e) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            window.location.href = createPageUrl(`Search?q=${encodeURIComponent(searchQuery)}`);
        }
    };

    return (
        <div className="bg-white animate-fade-in-up">
            <Seo
              title="Crowdfund a Premium Membership for a Local Business"
              description="Love a local business? Show your support by contributing to their Premium Membership fund. Help great businesses get the recognition and features they deserve."
            />
            {/* Hero Section */}
            <section className="relative bg-gradient-to-r from-teal-500 to-cyan-600 text-white py-20 px-4 sm:px-6 lg:px-8">
                <div className="absolute inset-0 bg-black/20"></div>
                <div className="relative max-w-4xl mx-auto text-center">
                    <Gift className="w-16 h-16 mx-auto mb-6 text-cyan-200" />
                    <h1 className="text-4xl md:text-6xl font-bold mb-4">
                        Gift a Premium Membership
                    </h1>
                    <p className="text-xl md:text-2xl text-cyan-100 mb-8">
                        Love a local business? Help them get the recognition they deserve by contributing to their Premium Membership.
                    </p>
                    <form onSubmit={handleSearch} className="max-w-xl mx-auto">
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                            <Input
                                type="text"
                                placeholder="Find a business to support..."
                                className="pl-12 pr-4 py-3 w-full rounded-full text-gray-900"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            <Button type="submit" className="absolute right-2 top-1/2 transform -translate-y-1/2 rounded-full">
                                Search
                            </Button>
                        </div>
                    </form>
                </div>
            </section>

            {/* How It Works Section */}
            <section className="py-20 px-4 sm:px-6 lg:px-8">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl font-bold text-gray-900 mb-4">
                            How Crowdfunding Works
                        </h2>
                        <p className="text-gray-600 text-lg max-w-2xl mx-auto">
                            It's a simple way to show your appreciation and help great businesses thrive.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center">
                        <div className="flex flex-col items-center">
                            <div className="flex items-center justify-center w-20 h-20 rounded-full bg-teal-100 text-teal-600 mb-6">
                                <Search className="w-10 h-10" />
                            </div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-2">1. Find a Business</h3>
                            <p className="text-gray-600">
                                Search for any business on our platform that you believe deserves more visibility.
                            </p>
                        </div>
                        <div className="flex flex-col items-center">
                            <div className="flex items-center justify-center w-20 h-20 rounded-full bg-teal-100 text-teal-600 mb-6">
                                <Heart className="w-10 h-10" />
                            </div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-2">2. Make a Contribution</h3>
                            <p className="text-gray-600">
                                On their business page, you'll see an option to contribute. Choose any amount you wish to give.
                            </p>
                        </div>
                        <div className="flex flex-col items-center">
                            <div className="flex items-center justify-center w-20 h-20 rounded-full bg-teal-100 text-teal-600 mb-6">
                                <Star className="w-10 h-10" />
                            </div>
                            <h3 className="text-xl font-semibold text-gray-900 mb-2">3. They Get Upgraded</h3>
                            <p className="text-gray-600">
                                Once the funding goal for a one-year premium plan is met, the business is automatically upgraded!
                            </p>
                        </div>
                    </div>
                </div>
            </section>

             {/* CTA Section */}
            <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
                <div className="max-w-3xl mx-auto text-center">
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">
                        Ready to Make a Difference?
                    </h2>
                    <p className="text-gray-600 text-lg mb-8">
                        Your contribution, big or small, can help a deserving business connect with more customers and grow.
                    </p>
                    <Link to={createPageUrl("Search")}>
                        <Button size="lg">Find a Business to Support Now</Button>
                    </Link>
                </div>
            </section>
        </div>
    );
}
