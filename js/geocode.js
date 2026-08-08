// Fri, nyckelfri platssökning via OpenStreetMap Nominatim.
export async function searchPlace(query) {
  if (!query || query.trim().length < 2) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&q=${encodeURIComponent(query)}&limit=5&accept-language=sv`;
  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return [];
    const json = await res.json();
    return json.map(item => {
      const addr = item.address || {};
      const shortLabel =
        addr.city || addr.town || addr.village || addr.municipality ||
        addr.hamlet || addr.county ||
        item.display_name.split(',')[0].trim();
      return {
        label: item.display_name,
        shortLabel,
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon)
      };
    });
  } catch (e) {
    console.warn('Platssökning misslyckades', e);
    return [];
  }
}
