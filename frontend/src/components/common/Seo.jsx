// Seo.jsx
import React, { useEffect, useState } from 'react';
import { listPageMeta } from '@/api/pagemeta';

export default function Seo({
  title,
  description,
  imageUrl,
  siteName = "MightyRankings.com",
  pageName,
  businessId
}) {
  const [metaConfig, setMetaConfig] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const loadMetaConfig = async () => {
      if (!pageName) {
        setMetaConfig(null);
        return;
      }

      try {
        const params = {
          page_name: pageName,
          is_active: true,
          limit: 1,
          ordering: '-updated_date',
        };

        if (businessId) {
          params.business_id = businessId; // business page meta
        } else {
          params.meta_type = 'static'; // static page meta
        }

        const items = await listPageMeta(params);
        if (isMounted) setMetaConfig(Array.isArray(items) && items[0] ? items[0] : null);
      } catch (err) {
        console.error('Failed to load meta config:', err);
        if (isMounted) setMetaConfig(null);
      }
    };

    loadMetaConfig();
    return () => { isMounted = false; };
  }, [pageName, businessId]);

  useEffect(() => {
    const finalTitle = metaConfig?.title || title;
    const finalDescription = metaConfig?.description || description;
    const finalImageUrl = metaConfig?.og_image || imageUrl;
    const finalKeywords = metaConfig?.keywords;
    const finalRobots = metaConfig?.robots || 'index, follow';
    const finalCanonicalUrl = metaConfig?.canonical_url;

    const finalSiteName = "MightyRankings.com";
    const fullTitle = finalTitle ? `${finalTitle} | ${finalSiteName}` : finalSiteName;

    document.title = fullTitle;

    // Standard meta
    upsertMetaTag('name', 'description', finalDescription || '');
    if (finalKeywords) upsertMetaTag('name', 'keywords', finalKeywords);
    upsertMetaTag('name', 'robots', finalRobots);

    // Canonical
    if (finalCanonicalUrl) {
      let canonicalLink = document.querySelector('link[rel="canonical"]');
      if (!canonicalLink) {
        canonicalLink = document.createElement('link');
        canonicalLink.setAttribute('rel', 'canonical');
        document.head.appendChild(canonicalLink);
      }
      canonicalLink.setAttribute('href', finalCanonicalUrl);
    }

    // Open Graph
    upsertMetaTag('property', 'og:title', metaConfig?.og_title || fullTitle);
    upsertMetaTag('property', 'og:description', metaConfig?.og_description || finalDescription || '');
    upsertMetaTag('property', 'og:site_name', finalSiteName);
    upsertMetaTag('property', 'og:url', window.location.href);
    upsertMetaTag('property', 'og:type', 'website');
    upsertMetaTag(
      'property',
      'og:image',
      finalImageUrl || '/seo-fallback.png'
    );

    // Twitter
    upsertMetaTag('name', 'twitter:card', 'summary_large_image');
    upsertMetaTag('name', 'twitter:title', metaConfig?.og_title || fullTitle);
    upsertMetaTag('name', 'twitter:description', metaConfig?.og_description || finalDescription || '');
  }, [title, description, imageUrl, siteName, metaConfig]);

  const upsertMetaTag = (attributeType, attributeValue, content) => {
    let element = document.querySelector(`meta[${attributeType}="${attributeValue}"]`);
    if (!element) {
      element = document.createElement('meta');
      element.setAttribute(attributeType, attributeValue);
      document.head.appendChild(element);
    }
    element.setAttribute('content', content);
  };

  return null;
}
