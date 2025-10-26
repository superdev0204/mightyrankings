export const unwrap = (resp) => (resp?.data?.results ?? resp?.data ?? []);
export const getCount = (resp) => {
  if (resp?.data?.count != null) return resp.data.count;
  const arr = resp?.data;
  return Array.isArray(arr) ? arr.length : 0;
};