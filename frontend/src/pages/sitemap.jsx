import React, { useEffect, useState } from 'react';
import { generateSitemapXML } from '../components/utils/sitemapGenerator';

export default function SitemapPage() {
  const [sitemapXml, setSitemapXml] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const xml = await generateSitemapXML();
        setSitemapXml(xml);
      } catch (err) {
        setError(err?.message || String(err));
        console.error('Failed to generate sitemap:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const downloadXml = () => {
    const blob = new Blob([sitemapXml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sitemap-preview.xml';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (loading) return <pre style={{ margin: 0, whiteSpace: 'pre' }}>Generating sitemap preview…</pre>;
  if (error) return <pre style={{ color: 'red', margin: 0, whiteSpace: 'pre' }}>Error: {error}</pre>;

  return (
    <div style={{ padding: 12 }}>
      <div
        style={{
          padding: 12,
          marginBottom: 12,
          border: '1px solid #f0ad4e',
          background: '#fcf8e3',
          borderRadius: 6,
          color: '#8a6d3b',
          fontSize: 14,
        }}
      >
        <strong>Preview only:</strong> search engines should crawl the backend sitemap at
        {' '}<code>/sitemap.xml</code>. This page is for quick auditing (limited to a safe cap).
      </div>

      <button onClick={downloadXml} style={{ marginBottom: 12 }}>
        Download sitemap-preview.xml
      </button>
      <pre style={{ fontFamily: 'monospace', whiteSpace: 'pre', margin: 0, padding: 0 }}>
        {sitemapXml}
      </pre>
    </div>
  );
}
