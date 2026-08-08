// Fri, nyckelfri platssökning via OpenStreetMap Nominatim.
// opts.near = { lat, lon } biasar resultaten mot ett område (t.ex. resans
// resmål) utan att utesluta träffar längre bort — viktigt för sökningar på
// specifika campingar/ställplatser som annars dränks av mer "viktiga"
// platser globalt.
export async function searchPlace(query, opts = {}) {
  if (!query || query.trim().length < 2) return [];
  const params = new URLSearchParams({
    format: 'jsonv2',
    addressdetails: '1',
    q: query,
    limit: '10',
    'accept-language': 'sv',
  });
  if (opts.near && opts.near.lat != null && opts.near.lon != null) {
    const { lat, lon } = opts.near;
    const delta = 1.5;
    params.set('viewbox', `${lon - delta},${lat + delta},${lon + delta},${lat - delta}`);
    params.set('bounded', '0');
  }
  const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
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
