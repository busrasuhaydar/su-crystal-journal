# Su's Magical Journal

Kişisel yaşam + sanat kariyeri + proje yönetimi uygulaması. Arayüz tamamen **Türkçe**, saat dilimi **Europe/Istanbul**.

## Yığın
- React 18 + TypeScript + Vite, TanStack Query, react-router (basename = `import.meta.env.BASE_URL`)
- Supabase projesi `tjouaydmwmokbuomyyub` (Postgres + RLS, Storage kovası `files`, Realtime, Edge Functions, pg_cron)
- Node: `export PATH="$HOME/.local/node/bin:$HOME/.local/bin:$PATH"` (gh ve supabase CLI de burada)
- Yayın: `main`'e push → GitHub Actions → https://busrasuhaydar.github.io/su-crystal-journal/ (`GH_PAGES=1` ile base `/su-crystal-journal/`; kristal defter teması; asıl uygulama ayrı repo: su-magical-journal)

## Komutlar
- Geliştirme: `npm run dev` (port 5173, strictPort)
- Kontrol: `npx tsc -p tsconfig.json` · Derleme: `npm run build`
- DB göçü: `supabase/migrations/` içine dosya yaz. `supabase db push` bu ağda çalışmıyor (IPv6); kısa DDL için MCP `apply_migration`, veri için `execute_sql` kullan (uzun SQL yapıştırma)
- Fonksiyon: `supabase functions deploy <ad> --project-ref tjouaydmwmokbuomyyub` (dispatcher ve oauth için `--no-verify-jwt`)

## Yapı
- `src/lib/data.ts` — tüm sorgular/mutasyonlar; `TABLE_KEYS` Realtime → sorgu yenileme eşlemesi (yeni tablo eklenirse buraya VE `supabase_realtime` yayınına ekle, yoksa tüm Realtime kanalı bozulur)
- `src/lib/dates.ts` — gün anahtarı `YYYY-MM-DD`, `toInstant/dayKeyOf/minutesOf` (İstanbul)
- `src/lib/types.ts` — tipler ve Türkçe etiketler
- `src/lib/nft.ts` — NFT verisi (`public/koleksiyonlar.json`: koleksiyonlar + 530 eser, orijinaller IPFS/Arweave/OpenSea'de; kopya tutulmaz), koleksiyon→proje eşitleme (`koleksiyon-<slug>`), orijinal kaydet/paylaş (`withWorkName`: paylaşım metninin başına eser adı)
- `src/lib/ui.ts` — ana sayfa özelleştirmesi (`profiles.ui_prefs`: kart başlıkları, gizleme, Boston saati); `src/lib/prefs.ts` — cihaza özel tercihler (şehir, sade mod); `src/lib/autoIcons.tsx` — simgesiz `.btn`'lere otomatik simge
- `src/components/` — Shell (menü, hava durumu `useWeather`), Editors (görev/etkinlik/içerik pencereleri, `useEditors`), TimeGrid, PostEditor, QuickSearch (⌘K; eserler dahil), NotificationBell, NftLightbox (galeri penceresi + "Bu eserle çalış": sayfa/fikir/görev)
- `src/pages/` — Home (hero, plan, Hatırlatmalar/düzenli işler, yapılacaklar, günün eseri, bu hafta), Calendar (ay/hafta/ajanda: görev, etkinlik, takip, kilometre taşı, proje hedefi, tekrar projeksiyonu), Day, Tasks, Projects, project/{Workspace,Gallery,Pages,Links,Sections}, Social, Opportunities, Contacts, Ideas, Gallery (ortak; "NFT eserleri" sekmesi), NftCollections (`/koleksiyonlar`, `/koleksiyonlar/:slug`, Eserler + Sayfalar sekmeleri), Files, Settings
- `supabase/functions/` — `extract-opportunity` (Claude ile duyuru çıkarma), `dispatcher` (her dakika: hatırlatıcı→bildirim/web push, yayın kuyruğu), `oauth`
- Stil: `src/styles/app.css` (en alttaki "Liquid Glass v2" ve sonraki bloklar belirteçleri geçersiz kılar; yeni stil hep dosyanın SONUNA)

## Kurallar
- Tek kayıt ilkesi: veri kopyalanmaz; ilişkiler `file_links`, `entity_links`, `project_*` tablolarıyla.
- Her tabloda `owner_id default auth.uid()` + RLS; değişiklikler `change_log`'a tetikleyiciyle yazılır; silme = `deleted_at` (yumuşak).
- `memory_entries` değiştirilemez (yalnız ekleme, `supersedes`).
- Sosyal paylaşım şu an elle: `src/lib/share.ts` (paylaş menüsü / X intent); paylaşımlar `post_shares`'e kaydedilir. API ile otomatik yayın altyapısı hazır ama anahtarlar girilmedi.
- Belirsiz bilgi uydurulmaz; dinî bayramlar Diyanet takvimi yayımlanana kadar `certainty='uncertain'` (2026–2027 kesinleşti, 2028 değil). Takvimde yalnız TR ve US tatilleri tutulur/gösterilir.
- Tekrarlayan görev (`rrule`): `complete_task` sonraki örneği ve hatırlatıcılarını aynı aralıkla taşır. Koleksiyon = proje; eser sayfaları `pages.artwork_key = '<sözleşme>-<tokenId>'` ile bağlanır.
- Her şey birbiriyle ilişkili olmalı (canlı organizma): yeni özellik mevcut kayıtlara (proje, sayfa, fikir, görev, takvim, arama ⌘K) bağlanmalı, ayrı ada olmamalı.
- Kullanıcıya Türkçe, kısa yanıt ver; token tasarrufu önemli.

## Arayüz kuralları (kullanıcı kesin istedi)
- Her butonun simgesi olur (lucide-react); metin oku (`←`) yerine simge. Kopyala yalnız simge; OpenSea/SuperRare link düğmeleri "OS"/"SR".
- Hiçbir öğe hiçbir cihazda çakışmaz: sabit konumlu öğe ekleme (arama/bildirim `.utilbar` ile akış içinde). Yeni sayfada 375px ve masaüstünde taşma/çakışma kontrol et.
- Arayüz Türkçe; ana sayfa Bursa hava durumu + küçük Boston saati.

## Token tasarrufu (önemli)
- İstenmedikçe kod tabanını keşfetme; CLAUDE.md'deki yapıya güven, yalnız ilgili dosyayı oku (gerekirse `grep -n` ile ilgili satırları).
- İstenmedikçe tarayıcı testi, ekran görüntüsü, uzun log okuma yapma. Kontrol = `npx tsc -p tsconfig.json`.
- Yayın: değişikliği `main`'e commit + push (Actions kendiliğinden yayınlar). Canlıda eski sürüm görünürse service worker önbelleği: sert yenile ya da `?v=<sayı>` ekle.
- Komut zincirinde `sed -i` macOS'ta bozuk; düzenleme için Python/Edit kullan ve `tsc` geçmeden commit/push etme.
- Yanıtlar kısa olsun.

## Bu bilgisayardaki kopya (kristal defter)
- Yerel klasör: `~/Desktop/Su Kristal Defter` (repo: `busrasuhaydar/su-crystal-journal`, dal: `main`). Geliştirme portu **5174** (diğer kopyalarla çakışmasın).
- Bu repo yalnız **kristal sihirli defter** arayüzünü yayınlar; diğer kopyalar (`su-magical-journal`, `su-magical-journal-glass-`) ayrı klasör/repo, onlara dokunma. Aynı Supabase projesini kullanır.
- Tema: `src/crystal/` — `scene.ts` (tek WebGL2 tuvali; arkaplan = `public/arkaplan.webp` şato manzarası, "cover" + mobilde şato odağı `focusX`, CSS yedeği `--bg-x`; `[data-glass]` öğelerini ölçüp cam levha çizer: cover/left/spine/page/dock/window/bar, en çok 8; kaydırırken/boyut değişince kare sınırsız), `shaders.ts` (yalnız cam shader'ı; arkaplanı görsel dokudan okur), `chrome.ts` (halka ve kilit PNG'si: piksel piksel ortam yansımalı gerçek krom, bir kez üretilir), `pageTurn.ts` (history sarmalayıcı + DOM kopyası; köşeden katlanan sayfa: katlama çizgisi = köşe↔çekilen nokta dik ortaylayı, `clip-path` + yansıma matrisi, rAF; katmanlar `.pf-layer/.pf-wrap/.pf-flap` z 24–26, çevirme sırasında canlı sayfa `.cl-hide`; geri = aynı hareketin tersi; yön = NAV sırası/history idx; sade/zoom/hareketi azalt modunda kapalı), `PageCorners.tsx` (fareyle geçiş: sağ/sol alt kıvrık köşe tıkla/sürükle → NAV sonraki/önceki, trackpad yatay kaydırma, fare yan tuşları = geçmiş; mobilde gizli), `Nav.tsx` (NAV listesi, mobil dok, İçindekiler/Yeni sayfaları), `Decor.tsx` (Ring/Clasp krom görselleri, cam yaprak yığını kenarları, süsler, açılış kapağı). Stil: `src/styles/crystal.css` (en sonda yüklenir; yeni stil dosya SONUNA).
- `sound.ts` (WebAudio: dokunuşta kristal cam sesi; sayfa çevirmede kısık 3 katmanlı kâğıt sesi: hava + tanecikli hışırtı + yumuşak dokunuş; `su:sound`), `look.tsx` (profil foto + arkaplan: `files` kovası `<uid>/ui/`, yollar `ui_prefs.avatar/bg`; `setBackground`). Ana sayfa penceresi `HeroArt` = `chrome.ts` `archUrl()` krom kemer + rastgele eser (günün eserinden farklı). Eser görüntüleyici portal + `ZoomStage` (eser tamamı sığarak açılır; tek tık = tıklanan noktaya gerçek çözünürlüğe yakınlaş, tekrar tık = sığdır). Sayfa yakınlaştırması AÇIK (viewport `maximum-scale=5`): zoom algılanınca (`visualViewport.scale` ≠ 1 ya da devicePixelRatio değişimi) `html.zm` + `no-gl` → WebGL tuval gizlenir, camlar CSS yedeğiyle, backdrop-filter/animasyon kapalı (titreme olmaz); tarih kutusu görseli `fixed` arkaplanla net. Mobilde yazı alanları 16px (iOS otomatik zoom yapmasın). WebGL döngüsü son girdiden 2,5 sn sonra durur (performans). Dokunmatikte `.cb-scroll` içindeki `[data-glass]` WebGL yerine CSS (`.css-glass`) çizilir (titreme olmasın).
- `[data-glass]` öğelerinin CSS zemini `html.gl` iken şeffaf olmalı (shader çizer); `html.no-gl` için CSS yedeği var. Yeni sayfa ekleyince `NAV`'a ekle.
- Ana sayfa üst şeridi: tarih en üstte, hava durumu/Boston küçük çip (bayraksız), sağda günün eseri kemer penceresi (`HeroArt`), hero `data-glass="window"` (şato görünür).
- Profil fotoğrafı sol üstteki madalyonda (`.cr-medal`, ana sayfa bağlantısı); menüde ayrı "Ana Sayfa" düğmesi yok, dok ev simgesi düz.
- Görsel dil (kullanıcı kesin istedi): her şey cam + krom. Düğmeler: krom bilezik (`.btn::before` maske), yarı saydam cam gövde, prizma kenarı (`--prism`), transform ile kayan ışık (`cr-glint`). Pembe birincil = pembe krom-cam, turkuaz (`.btn-teal`, `.count`) = turkuaz krom. Menü / dok / İçindekiler simgeleri = renkli kristal mücevher (`--g1/--g2/--g3/--gl`, krom çerçeve `border` + `border-box` gradyan, beyaz ışık topu YOK), 13 belirgin farklı ton (pembe, turkuaz, canlı turuncu, mor, limon, mavi, altın, orkide, zümrüt, gök mavisi, oniks, çivit, gümüş); seçili = altın krom halka + menüde altın işaret çubuğu. Barbie paleti: düğmelerde kırmızı yok (`.btn-danger` fuşya). Seçili sekme (`.ptabs a.on`, `.seg .on`) pembe krom kristal hap + alt parıltı noktası. Simge gradyanları `#cr-ic`/`#cr-ic-teal` `main.tsx`'te DOM'a eklenir (`stroke: url(#cr-ic) <yedek renk>`). Performans için yeni backdrop-filter ekleme.
- Hover'da `transform` ile yukarı kaydırma YAPMA (imleç altından çıkıp titreme yapar); yalnız gölge/ışık. `.btn { position: relative }` mutlak konumlu `.btn`'leri bozar: `.lb > .lb-x` gibi daha özgül kural yaz. Açılır pencereler gerçek cam (yarı saydam + blur).
- Canlı site: https://busrasuhaydar.github.io/su-crystal-journal/ — Pages kaynağı **GitHub Actions** (`.github/workflows/deploy.yml`).
- Yayın = `tsc` geçtikten sonra `main`'e commit + push. Actions kendiliğinden derleyip yayınlar (~1 dk).
- `.env` repoda izleniyor (anon anahtar herkese açık olacak şekilde tasarlanmıştır, RLS korur). `service_role` ya da başka gizli anahtarı ASLA `.env`'e veya repoya yazma.
