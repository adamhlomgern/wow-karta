// Supabase-biblioteket laddas via en vanlig <script>-tagg (UMD) i HTML-filen
// innan denna modul körs — det ger window.supabase.createClient(...).
const cfg = window.SUPABASE_CONFIG;
const lib = window.supabase;

if (!lib) {
  throw new Error('Supabase-biblioteket kunde inte laddas (kontrollera internetuppkopplingen).');
}

if (!cfg || !cfg.url || !cfg.anonKey || cfg.url.includes('ditt-projekt')) {
  document.addEventListener('DOMContentLoaded', () => {
    document.body.innerHTML = `
      <div style="max-width:480px;margin:80px auto;padding:24px;font-family:sans-serif;line-height:1.6;">
        <h2>Konfiguration saknas</h2>
        <p>Kopiera <code>config.example.js</code> till <code>config.js</code> i projektmappen och fyll i din
        Supabase Project URL och anon key (Supabase-dashboarden → Settings → API). Ladda sedan om sidan.</p>
      </div>`;
  });
  throw new Error('Supabase config saknas — se config.example.js');
}

export const supabase = lib.createClient(cfg.url, cfg.anonKey);
