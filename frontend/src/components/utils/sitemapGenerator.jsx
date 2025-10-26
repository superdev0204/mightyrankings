import { listCategories } from '@/api/categories';
import { listBusinessesPaged, businessPath } from '@/api/businesses';
import { listDoctorsPaged, doctorPath } from '@/api/doctors';

/** Encode a hierarchical path safely into a URL path */
function encodeSegments(path) {
  return String(path || '')
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
}

/** Minimal XML escaping for text content nodes */
function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** ISO date (YYYY-MM-DD) from a value, with fallback to today */
function isoDateFrom(v, today) {
  try {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  } catch {}
  return today;
}

/**
 * Resilient page fetcher for offset/limit endpoints.
 * Retries a failing window with smaller page sizes; stops cleanly on persistent errors.
 */
async function fetchAllPagedResilient(
  fetcher,
  {
    initialPageSize = 100,
    minPageSize = 10,
    maxRows = 5000, // keep preview modest; backend handles the real ~700k scale
    baseParams = {},
  } = {}
) {
  const out = [];
  let offset = 0;

  async function fetchWindow(off, pageSize) {
    try {
      const res = await fetcher({
        ...baseParams,
        limit: pageSize,
        offset: off,
        ordering: baseParams.ordering || '-updated_at',
      });
      const items = Array.isArray(res?.items) ? res.items : [];
      return items;
    } catch (err) {
      if (pageSize > minPageSize) {
        const smaller = Math.max(minPageSize, Math.floor(pageSize / 2));
        return fetchWindow(off, smaller);
      }
      throw err;
    }
  }

  while (out.length < maxRows) {
    let items = [];
    try {
      items = await fetchWindow(offset, initialPageSize);
    } catch (e) {
      console.error('Paged fetch failed for offset', offset, e);
      break;
    }
    if (!items.length) break;

    out.push(...items);
    offset += items.length;

    if (items.length < initialPageSize) break;
  }

  return out.slice(0, maxRows);
}

export async function generateSitemapXML() {
  const baseUrl = String(window.location.origin).replace(/\/$/, '');
  const today = new Date().toISOString().slice(0, 10);

  // Keep this list small & stable
  const staticPages = [
    { url: '/',               priority: '1.0', changefreq: 'daily'   },
    { url: '/Search',         priority: '0.9', changefreq: 'weekly'  },
    { url: '/AddBusiness',    priority: '0.8', changefreq: 'monthly' },
    { url: '/Premium',        priority: '0.8', changefreq: 'monthly' },
    { url: '/Crowdfund',      priority: '0.6', changefreq: 'monthly' },
    { url: '/Compare',        priority: '0.6', changefreq: 'monthly' },
    { url: '/TermsOfService', priority: '0.3', changefreq: 'yearly'  },
  ];

  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');

  // 1) Static pages
  for (const p of staticPages) {
    const loc = `${baseUrl}${p.url === '/' ? '/' : p.url}`;
    lines.push('  <url>');
    lines.push(`    <loc>${xmlEscape(loc)}</loc>`);
    lines.push(`    <lastmod>${today}</lastmod>`);
    lines.push(`    <changefreq>${p.changefreq}</changefreq>`);
    lines.push(`    <priority>${p.priority}</priority>`);
    lines.push('  </url>');
  }

  // 2) Category landing pages (include all; don’t skip doctor-only categories here)
  try {
    const cats = await listCategories({ ordering: 'name', limit: 10000 });
    (Array.isArray(cats) ? cats : []).forEach((c) => {
      const full = c?.full_slug || c?.slug;
      if (!full) return;
      const loc = `${baseUrl}/${encodeSegments(full)}/`;
      lines.push('  <url>');
      lines.push(`    <loc>${xmlEscape(loc)}</loc>`);
      lines.push(`    <lastmod>${today}</lastmod>`);
      lines.push('    <changefreq>weekly</changefreq>');
      lines.push('    <priority>0.7</priority>');
      lines.push('  </url>');
    });
  } catch (e) {
    console.error('Could not fetch categories for sitemap', e);
    lines.push(`  <!-- categories fetch failed: ${xmlEscape(e?.message || String(e))} -->`);
  }

  // 3) Dynamic detail pages: Businesses + Doctors (preview scale)
  try {
    const baseParams = {}; // Narrow if you only want indexable statuses.

    const [biz, docs] = await Promise.all([
      fetchAllPagedResilient(listBusinessesPaged, {
        initialPageSize: 100,
        minPageSize: 10,
        maxRows: 5000,
        baseParams,
      }),
      fetchAllPagedResilient(listDoctorsPaged, {
        initialPageSize: 100,
        minPageSize: 10,
        maxRows: 5000,
        baseParams,
      }),
    ]);

    const urlSet = new Set(); // de-dupe by loc

    const pushUrl = (loc, lastmod = today, changefreq = 'weekly', priority = '0.7') => {
      if (urlSet.has(loc)) return;
      urlSet.add(loc);
      lines.push('  <url>');
      lines.push(`    <loc>${xmlEscape(loc)}</loc>`);
      lines.push(`    <lastmod>${lastmod}</lastmod>`);
      lines.push(`    <changefreq>${changefreq}</changefreq>`);
      lines.push(`    <priority>${priority}</priority>`);
      lines.push('  </url>');
    };

    // Businesses
    (Array.isArray(biz) ? biz : []).forEach((b) => {
      const slug = b?.slug;
      if (!slug) return;

      const path = typeof businessPath === 'function'
        ? businessPath(b)
        : (b?.category_full_slug && slug
            ? `/business/${encodeSegments(b.category_full_slug)}/${encodeURIComponent(slug)}`
            : `/business/${encodeURIComponent(slug)}`);

      const loc = `${baseUrl}${path}`;
      const lastmod = isoDateFrom(b?.updated_at || b?.updated || b?.created_at || b?.created, today);
      pushUrl(loc, lastmod);
    });

    // Doctors — FIX: ensure /doctor/... fallback, not /business/...
    (Array.isArray(docs) ? docs : []).forEach((d) => {
      const slug = d?.slug;
      if (!slug) return;

      const path = typeof doctorPath === 'function'
        ? doctorPath(d)
        : (d?.category_full_slug && slug
            ? `/doctor/${encodeSegments(d.category_full_slug)}/${encodeURIComponent(slug)}`
            : `/doctor/${encodeURIComponent(slug)}`);

      const loc = `${baseUrl}${path}`;
      const lastmod = isoDateFrom(d?.updated_at || d?.updated || d?.created_at || d?.created, today);
      pushUrl(loc, lastmod);
    });
  } catch (e) {
    console.error('Could not fetch listings for sitemap', e);
    lines.push(`  <!-- listings fetch failed: ${xmlEscape(e?.message || String(e))} -->`);
  }

  lines.push('</urlset>');
  return lines.join('\n');
}
