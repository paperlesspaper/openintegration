# Payload Integration Checklist

Use this checklist when adding integrations from `paperlesspaper-integrations` to the Payload `integrations` collection.

## Source Files

- Start with the German locale (`locale: "de"`).
- Read the root `README.md` for the production base URL.
- Read the integration folder:
  - `README.md`
  - `config.json`
  - `assets/icon.png`
  - `screenshots/*.png`
- Confirm referenced screenshots exist on disk before creating the Payload entry. If a manifest references screenshots but the `screenshots/` files are missing, skip the entry until screenshots are generated.

Production config URL format:

```txt
https://integrations.paperlesspaper.de/<slug>/config.json
```

## Payload Fields

- `title`: German display title.
- `longTitle`: original English title if useful.
- `subtitle`: short German summary.
- `excerpt`: short German factual excerpt.
- `slug`: `integrations/<slug>`.
- `configUrl`: production config URL.
- `config`: full parsed `config.json` object.
- `_status`: `published`.
- `publishedDate`: current publish date.
- `meta.title`: same as `title`.
- `meta.description`: same as `subtitle` or a similarly short factual summary.
- `meta.image`: icon media ID.

Check for existing entries by `slug` first. Some older entries may use `applications/<slug>` instead of `integrations/<slug>`, so compare both the slug and the app name/title before creating duplicates.

## Media

- Upload the app icon as a Payload `media` item.
- Use the icon in `Hero > Media file`.
- Upload all screenshots as Payload `media` items.
- Use descriptive German `alt` text for screenshots.
- Prefer stable Payload filenames prefixed with the app slug, for example `<slug>-icon.png` and the existing screenshot filenames.
- If local file upload is not available through the MCP, create media from the production asset URL:

```txt
https://integrations.paperlesspaper.de/<slug>/assets/icon.png
https://integrations.paperlesspaper.de/<slug>/screenshots/<filename>.png
```

Important finding from the June 2026 integration batch: media records created from only a remote `url` can look valid in Payload, with filename, dimensions, filesize, `url`, and `thumbnailURL`, while the public `media.paperlesspaper.de` URLs still return 404. Do not treat populated media metadata as sufficient.

If a created media item is missing publicly, staging the local source file under the final Payload filename can make `updateMedia` accept the update without a filename validation error:

```txt
/tmp/payload-media-repair/<slug>-icon.png
/tmp/payload-media-repair/<screenshot-filename>.png
```

For app icons, copy `assets/icon.png` to `/tmp/payload-media-repair/<slug>-icon.png` before calling `updateMedia`; uploading `assets/icon.png` directly can fail because Payload validates the generated `filename`.

However, the current paperlesspaper Payload MCP does not appear to publish file bytes to cloud storage. `updateMedia` with `filePath` updates media metadata, but public URLs can still return `404` with `Processing failed: File not found: paperlesspaper-website/<filename>`. `createMedia` with `filePath` is not exposed by the schema and returned `No files were uploaded` when tested. If this happens, use the backend/admin upload path or a storage sync/purge outside the current MCP before publishing the entry.

The media service exposes an upload route:

```txt
POST https://media.paperlesspaper.de/api/upload
```

It requires authentication and returned:

```txt
Authentication required: provide Authorization: Bearer <key> or a valid session cookie
```

Use this route, the admin UI, or an equivalent storage sync to place files under `paperlesspaper-website/<filename>`.

Confirmed upload shape:

```txt
Authorization: Bearer <OPENINARY_API_KEY>
multipart field: files=@<local-file>
multipart field: folder=paperlesspaper-website
multipart field: filename=<filename>
```

## Content Layout

Use one `content` block.

Keep the text short and factual:

- 1-2 short paragraphs.
- Explain what the integration shows.
- Mention key configuration options.
- Mention supported languages or data source only if relevant.
- Avoid long marketing copy, headings, and lengthy setup explanations.

Example style:

```txt
Tree of the Day zeigt täglich einen deterministisch ausgewählten Baum auf dem paperlesspaper-Display. Die Integration kombiniert botanische Illustrationen mit kompakten Fakten aus gepflegten Wikipedia-Quellen.

Konfigurierbar sind Region, Kategorie, ein optional fest gewählter Baum sowie die angezeigten Faktenfelder. Unterstützt werden Deutsch und Englisch.
```

## Gallery Layout

Use one `gallery` block after the content block.

Width rules:

- Landscape screenshots: `width: "default"` (Payload label: Full)
- Portrait screenshots: `width: "half"`
- A `half` image must always be followed by another `half` image.

Preferred ordering:

```txt
landscape: full
portrait: half
portrait: half
landscape: full
```

Use the README screenshot table or `configVariants` order as the source of truth. If those differ, prefer the order that produces the required full/half/half/full Payload gallery and keep related variants adjacent.

In Payload API values:

```json
[
  { "blockType": "mediaBlock", "media": "<landscape-id>", "width": "default" },
  { "blockType": "mediaBlock", "media": "<portrait-id>", "width": "half" },
  { "blockType": "mediaBlock", "media": "<portrait-id>", "width": "half" },
  { "blockType": "mediaBlock", "media": "<landscape-id>", "width": "default" }
]
```

## Tags

Use the same hero tags as existing integration entries when appropriate:

- `paperlesspaper`: `66feebba65b717ea2dd4ddc6`
- `Anwendungen`: `67102a9e20c0f9c002903d00`

## Verification

After creating or updating the integration:

- Read it back from `findIntegrations`.
- Confirm:
  - `slug`
  - `_status`
  - `configUrl`
  - embedded `config`
  - hero media exists
  - hero media public URL returns an image response
  - gallery media count
  - gallery width/order rules
  - every gallery media public URL returns an image response
  - short factual content
- Confirm the hero tags include:
  - `paperlesspaper`
  - `Anwendungen`
- Confirm `config.nativeSettings`, `config.configVariants`, `config.formSchema`, and `config.language` survived the write.
- Watch for Payload JSON coercion in embedded config objects. A field pair named `latitude`/`longitude` may be interpreted as a coordinate and can collapse surrounding object data on read-back. If this happens, update the embedded `config` and preserve the complete settings object; using string values for `nativeSettings.latitude` and `nativeSettings.longitude` avoids the coordinate coercion while leaving numeric values in `configVariants` and `formSchema`.
- Verify public media with both original and transformed URLs, for example:

```txt
https://media.paperlesspaper.de/t/paperlesspaper-website/<filename>
https://media.paperlesspaper.de/t/c_limit,w_480,h_480,f_auto,q_auto/paperlesspaper-website/<filename>
```

If many media URLs are probed in a row, the media host can return `429`; wait before rechecking instead of treating that as a missing image.

## Recent Completed Entries

The following entries were added from `paperlesspaper-integrations/applications`:

- `simple-calendar`: `6a3eeecef490d5bde678ae0e`
- `bird-of-the-day`: `6a3eeeeff490d5bde678ae16`
- `bike-commute-card`: `6a3eef10f490d5bde678ae1e`
- `nfl-scoreboard`: `6a3eef30f490d5bde678ae26`
- `guest-mode-card`: `6a3eef5af490d5bde678ae33`
- `train-of-the-day`: `6a3ef7ecf490d5bde678afdb`
- `apple-photos-gallery`: `6a3ef80ef490d5bde678afe3`
- `mastodon`: `6a3ef831f490d5bde678afeb`
- `airtable`: `6a3ef858f490d5bde678aff3`
- `astronauts`: `6a3ef871f490d5bde678b02d`
- `constellations-in-the-sky`: `6a3f0481f490d5bde678b3b3`
- `country-of-the-day`: `6a3f049ef490d5bde678b3bb`
- `dinosaur-of-the-day`: `6a3f04c3f490d5bde678b3e5`
- `dwd-pollenflug`: `6a3f0504f490d5bde678b3ed`
- `soccer-standings`: `6a3f0524f490d5bde678b3f5`
- `finance-snapshot`: `6a3f0739f490d5bde678b565`
- `formula-1-races`: `6a3f075af490d5bde678b56d`
- `kids-fact-card`: `6a3f0776f490d5bde678b575`
- `opening-hours`: `6a3f07a1f490d5bde678b57d`
- `uptime-kuma-monitor`: `6a3f07c0f490d5bde678b585`
- `quote`: `6a3f0b04f490d5bde678b741`
- `simple-text`: `6a3f0b25f490d5bde678b749`
- `bible-verses`: `6a3f0b45f490d5bde678b751`
- `losung`: `6a3f0b60f490d5bde678b759`
- `waste-collection-schedule`: `6a3f0b86f490d5bde678b761`
- `day-calendar`: `6a3fa2e9f490d5bde678b9d7`
- `xkcd`: `6a3fa301f490d5bde678b9df`
- `immich-photos`: `6a3fa326f490d5bde678b9e7`
- `tour-de-france`: `6a3fa346f490d5bde678b9ef`
- `world-cup-2026`: `6a3fa365f490d5bde678b9f7`
- `your-life-in-weeks`: `6a3fa4c5f490d5bde678ba83`
- `newsstand`: `6a3fa4e1f490d5bde678ba8b`
- `daily-buddhism-wisdom`: `6a3fa5fff490d5bde678bacd`
- `duden-wort-des-tages`: `6a3fa61df490d5bde678bad5`
- `google-sheet-table`: `6a3fa63af490d5bde678badd`
- `moon-phase`: `6a3fa730f490d5bde678bb07`
- `countdown-card`: `6a3fa745f490d5bde678bb0f`
- `chore-wheel`: `6a3fa75bf490d5bde678bb17`
- `spacecraft-of-the-day`: `6a3fa776f490d5bde678bb1f`
- `travel-map`: `6a3fabd0f490d5bde678bb88`

Media repair note:

- The new batch initially had Payload media metadata but public media URLs returned 404 for most files.
- Local source files were staged in `/tmp/payload-media-repair` with final Payload filenames and `updateMedia` accepted the updates, but the public media storage still reported missing files for representative repaired URLs.
- A unique test file, `bird-of-the-day-icon-repair-20260627.png`, also returned `File not found`, confirming this was not only stale 404 cache.
- The current MCP surface can repair metadata but did not publish the backing file objects.
- The 50 media files for the ten recent integrations were uploaded through the media service with `OPENINARY_API_KEY`.
- Public verification passed for all 50 original media URLs and all 50 `c_limit,w_480,h_480,f_auto,q_auto` thumbnail URLs. A fast verification sweep may hit `429`; use a slow pass for any throttled URLs.
- The next five integrations added 25 media files through the same media service route. Public verification passed for all 25 original media URLs and all 25 `c_limit,w_480,h_480,f_auto,q_auto` thumbnail URLs.
- The following five integrations added another 25 media files through the media service route. Public verification passed for all 25 original media URLs and all 25 `c_limit,w_480,h_480,f_auto,q_auto` thumbnail URLs.
- During that batch, `createMedia` returned `Invalid file type: image/webp` for PNG URLs served through the media transformer, but still created valid media records with `mimeType: image/webp`. Read media back by filename before retrying, otherwise duplicate media records can be created.
- The next five integrations added another 25 media files through the media service route. Public verification passed for all 25 original media URLs and all 25 `c_limit,w_480,h_480,f_auto,q_auto` thumbnail URLs.
- The next two integrations added another 10 media files through the media service route. Public verification passed for all 10 original media URLs and all 10 `c_limit,w_480,h_480,f_auto,q_auto` thumbnail URLs.
- The next three integrations added another 9 media files through the media service route. Public verification passed for all 9 original media URLs and all 9 `c_limit,w_480,h_480,f_auto,q_auto` thumbnail URLs.
- The next four integrations added 4 icon files through the media service route. Public verification passed for all 4 original icon URLs and all 4 `c_limit,w_480,h_480,f_auto,q_auto` thumbnail URLs.
- The final local integration added 1 icon file through the media service route. Public verification passed for the original icon URL and the `c_limit,w_480,h_480,f_auto,q_auto` thumbnail URL.

Batch notes:

- `constellations-in-the-sky`: `nativeSettings.latitude` and `nativeSettings.longitude` were stored as strings to avoid Payload coordinate coercion; numeric values remain in `configVariants` and `formSchema`.
- `dwd-pollenflug`: `configVariants` only reference portrait screenshots, but matching landscape screenshots exist and were used in the gallery from the README.
- `soccer-standings`: `configVariants` do not include screenshot references, so the gallery order follows the README screenshot table.
- `formula-1-races`: gallery uses `round-one-compact` landscape first, then a portrait half pair, then `upcoming-full` landscape to keep the full/half/half/full ordering.
- `the-onion-editorial-cartoon`: an older Payload entry was found and repaired in place (`6a2f0f635befa49612a248e9`); it now uses `integrations/the-onion-editorial-cartoon`, is published, has the full embedded config, and follows the standard gallery order.
- `day-calendar`: `nativeSettings.latitude` and `nativeSettings.longitude` were stored as strings to avoid Payload coordinate coercion; numeric values remain in `formSchema`.
- `weather`: skipped because an existing Payload entry was found at `applications/weather` (`671031ada2f0de74e7c0018d`).
- `deutsche-bahn-abfahrten`: skipped because an existing Payload entry was found at `integrations/deutsche-bahn-abfahrten` (`6a3bdef03db468421ed48ed3`).
- `daily-buddhism-wisdom`, `duden-wort-des-tages`, and `google-sheet-table`: only one landscape/portrait screenshot pair was available, so the gallery uses two full-width media blocks instead of an unpaired `half` portrait.
- `moon-phase`, `countdown-card`, `chore-wheel`, and `spacecraft-of-the-day`: no screenshots were found on disk, so these entries were published with icon hero media and content only, without a gallery block.
- `travel-map`: no screenshots were found on disk despite `configVariants` screenshot references, so the entry was published with icon hero media and content only, without a gallery block.

All local `paperlesspaper-integrations/applications` entries have now either been added or were already present in Payload.

Follow-up audit on 2026-06-27:

- The source repository contains 44 application `config.json` files, all under `paperlesspaper-integrations/applications`.
- No additional integration source folders were found outside `applications`; `output`, `public`, `server`, `scripts`, and `vendor` do not add separate Payload integration candidates.
- Payload currently has matching entries for all 44 local application folders, including the older `applications/weather` and `integrations/deutsche-bahn-abfahrten` records.
- The local `status` field was synced into both backend `integrations.status` and `integrations.config.status` for all 44 app records: 37 `alpha` and 7 `beta`. App consumers read the top-level `status` field.
- `the-onion-editorial-cartoon` was repaired after the status sync: it is now published at `integrations/the-onion-editorial-cartoon`, includes the full local config with `status: "alpha"`, has `configUrl` and `githubUrl`, and is visible in the web backend REST list.

## Example Completed Entry

`tree-of-the-day` was added as:

- Document ID: `6a3ee9caf490d5bde678a9df`
- Slug: `integrations/tree-of-the-day`
- German title: `Baum des Tages`
- Config URL: `https://integrations.paperlesspaper.de/tree-of-the-day/config.json`
- Gallery order: landscape full, portrait half, portrait half, landscape full
