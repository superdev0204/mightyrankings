export function slugify(text) {
  if (!text) return '';
  
  return text
    .toString()
    .toLowerCase()
    .trim()
    // Replace spaces with hyphens
    .replace(/\s+/g, '-')
    // Remove special characters except hyphens
    .replace(/[^\w\-]+/g, '')
    // Replace multiple hyphens with single hyphen
    .replace(/\-\-+/g, '-')
    // Remove leading/trailing hyphens
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

export function unslugify(slug) {
  if (!slug) return '';
  
  return slug
    .replace(/-/g, ' ')
    .replace(/\w\S*/g, (txt) => 
      txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
}

// New function to generate SEO-friendly business URLs
export function generateBusinessUrl(business) {
  if (!business || !business.name) return '';
  
  const categorySlug = business.category ? slugify(business.category) : 'business';
  const nameSlug = slugify(business.name);
  
  return `business/${categorySlug}/${nameSlug}`;
}

// Enhanced function to parse business URL parameters
export function parseBusinessUrl(urlPath) {
  // Handle both old format (Business?name=slug) and new format (business/category/name)
  if (urlPath.includes('?')) {
    // Old format: Business?name=business-name
    const urlParams = new URLSearchParams(urlPath.split('?')[1]);
    return {
      nameSlug: urlParams.get("name"),
      categorySlug: null,
      isLegacyFormat: true
    };
  }
  
  // New format: business/category/name
  const parts = urlPath.split('/').filter(Boolean);
  if (parts.length >= 3 && parts[0] === 'business') {
    return {
      categorySlug: parts[1],
      nameSlug: parts[2],
      isLegacyFormat: false
    };
  }
  
  // Handle case where there might be extra path segments
  if (parts.length >= 2 && parts[0] === 'business') {
    // Try to extract the last part as business name
    const nameSlug = parts[parts.length - 1];
    const categorySlug = parts.length > 2 ? parts[1] : null;
    
    return {
      categorySlug: categorySlug,
      nameSlug: nameSlug,
      isLegacyFormat: false
    };
  }
  
  return null;
}