# Kom igång — Reseplaneraren

All kod är klar. Du behöver bara koppla ihop två gratistjänster: **Supabase** (databas + inloggning) och **Vercel** (webbhosting).

## 1. Skapa Supabase-projekt (databas + inloggning)

1. Gå till [supabase.com](https://supabase.com) → skapa gratis konto → **New project**.
2. Vänta tills projektet är klart (tar ~1 min).
3. Gå till **SQL Editor** i vänstermenyn → **New query**.
4. Öppna [sql/schema.sql](sql/schema.sql) i den här mappen, klistra in hela innehållet i SQL-editorn → **Run**.
   - Det skapar tabellerna `trips` och `places`, samt säkerhetsregler (RLS) så att varje inloggad person bara ser sina egna resor.
5. Gå till **Settings → API**. Kopiera:
   - **Project URL**
   - **anon public** key (den korta nyckeln, inte `service_role`)
6. (Valfritt men rekommenderat för en snabb start) Under **Authentication → Providers → Email**, stäng av "Confirm email" om du inte vill bekräfta mejladressen via länk varje gång ni registrerar er — annars får ni ett bekräftelsemejl efter registrering som måste klickas innan inloggning fungerar.

## 2. Fyll i era Supabase-uppgifter

1. Kopiera `config.example.js` → döp kopian till `config.js` (samma mapp).
2. Öppna `config.js` och klistra in din **Project URL** och **anon key** från steg 1.
3. `config.js` ska INTE delas offentligt på GitHub eftersom den pekar mot ert specifika projekt (även om anon-nyckeln i sig är säker att exponera, är det bästa praxis att hålla den utanför git — lägg gärna till `config.js` i en `.gitignore`).

## 3. Testa lokalt

**Viktigt:** appen är nu uppdelad i flera JavaScript-filer som laddar varandra ("moduler"). Webbläsare blockerar det av säkerhetsskäl om man bara dubbelklickar på `index.html` (`file://...`) — ni får en tom sida eller ett fel i konsolen. Det behövs en riktig (lokal) webbserver, precis som steg 4 nedan ändå ordnar. Enklast:

1. Installera Node.js om du inte redan har det: [nodejs.org](https://nodejs.org).
2. Installera Vercel CLI (används även för publicering i steg 4):
   ```bash
   npm install -g vercel
   ```
3. Kör i projektmappen:
   ```bash
   vercel dev
   ```
4. Följ prompten (logga in, välj standardval). Den startar en lokal server, typ `http://localhost:3000` — öppna den länken i webbläsaren istället för att dubbelklicka på filen.
5. Registrera ett konto, logga in, skapa en resa och testa att lägga till en plats.

*(Alternativ om du inte vill installera Vercel CLI än: `npx serve .` eller `python -m http.server 8000` i projektmappen fungerar också för lokal testning — öppna sedan `http://localhost:<port>`.)*

## 4. Publicera på nätet (Vercel) så ni kan surfa in från mobilen

1. Skapa gratis konto på [vercel.com](https://vercel.com) (om du inte redan gjorde det i steg 3).
2. Kör i projektmappen:
   ```bash
   vercel --prod
   ```
3. Följ prompten — första gången frågar den om projektnamn (tryck Enter för standard).
4. Du får en länk typ `https://wow-karta.vercel.app` — den funkar direkt på mobilen också.
5. När ni vill uppdatera appen efter att jag gjort ändringar: kör `vercel --prod` igen i mappen.

## Klart!

Ni loggar in med samma mejl + lösenord på både dator och mobil, och ser samma resor och platser överallt — data ligger i molnet (Supabase), inte i webbläsaren.
