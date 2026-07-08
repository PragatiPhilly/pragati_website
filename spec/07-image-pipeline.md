# Image Pipeline

How uploaded images flow from admin → storage → public CDN, and how we keep the site fast.

## The problem

Admins upload images straight from their phone (Durga Pujo poster, sponsor logo, team photo). These can be 5–20 MB JPEG/PNG/HEIC. If we serve them directly, every page load downloads 20 MB and the site dies.

## The solution

On upload, we generate multiple optimized variants. Browsers receive the smallest version that's appropriate for their screen.

## Upload flow

1. Admin selects file in the admin UI (image picker accepts JPEG, PNG, WebP, HEIC up to 20 MB)
2. Client POSTs `multipart/form-data` to `/api/admin/upload-image`
3. Server:
   - Validate: size, mime type, dimensions
   - Read into memory
   - Use **Sharp** to:
     - Convert HEIC → JPEG (HEIC isn't browser-supported)
     - Auto-rotate based on EXIF orientation
     - Strip EXIF metadata (privacy: removes GPS, camera serial)
     - Generate variants:
       - `thumb`: 200px wide, 70% quality, WebP
       - `small`: 400px wide, 75% quality, WebP
       - `medium`: 800px wide, 80% quality, WebP
       - `large`: 1600px wide, 85% quality, WebP
       - `original`: keep original, also as JPEG
     - Generate AVIF variants of medium and large (smaller for modern browsers)
   - Upload each variant to **Cloudflare R2** with cache-control headers (1 year immutable)
   - Insert into `images` table with all variant URLs in `variants` JSONB
4. Server responds with `{ id, variants: { thumb, small, medium, large, original, avif_medium, avif_large } }`
5. Admin sees the image; can crop, replace, delete

## Storage layout in R2

```
pragati-images/
  events/
    {eventId}/
      poster-{imageId}-thumb.webp
      poster-{imageId}-small.webp
      poster-{imageId}-medium.webp
      poster-{imageId}-large.webp
      poster-{imageId}-original.jpg
  sponsors/
    {sponsorId}/
      logo-{imageId}-thumb.webp
      ...
  team/
    {teamMemberId}/
      photo-{imageId}-...
  gallery/
    {eventId}/
      photo-{imageId}-...
  magazines/
    {magazineId}/
      cover-{imageId}-...
      magazine-{magazineId}.pdf
```

All public-readable. URLs are stable forever (immutable).

## Serving images

We use Next.js `<Image>` component with `srcSet` automatically:

```tsx
<Image
  src={event.poster.variants.large}
  alt={event.name}
  width={1600} height={900}
  sizes="(max-width: 600px) 400px, (max-width: 1200px) 800px, 1600px"
  priority={isAboveFold}
/>
```

Next.js + Cloudflare picks the optimal variant per browser:
- Mobile Safari → `webp` medium
- iPhone with AVIF support → `avif` medium
- Desktop Chrome → `webp` large
- Edge cases → `original` JPEG

## Magazine PDFs

**Deferred to v2.** Per committee decision, the yearly Pragati magazine is sold physically at the Pujo event counter — not distributed digitally through the website in v1.

The `/magazine` page still exists on the site but displays a static message: *"Yearly magazines are available for purchase at the Pujo event counter."* Plus a gallery of historical magazine cover images (which do go through the standard image pipeline above).

When v2 adds digital magazine distribution, the pipeline will be:
1. Admin uploads PDF (max 50 MB)
2. Validate it's a real PDF (magic bytes)
3. Strip metadata
4. Upload to R2 with `Content-Disposition: inline`
5. Generate cover image variant from page 1 using `pdf-to-image` library

Until then, no PDF pipeline is built.

## Image deletion

When admin deletes an image:
1. Mark as deleted in DB (soft)
2. Check if it's still referenced (by any event, sponsor, team_member, magazine)
3. If not referenced, queue actual R2 deletion after 7-day grace period
4. R2 deletion frees the storage

## Cost

R2 pricing:
- Storage: $0.015 / GB / month
- Egress: $0 (zero!)
- Class A operations: $4.50 per million
- Class B operations: $0.36 per million

At our scale (estimated 10 GB total images, 100K page views/year):
- Storage: $0.15/month
- Egress: $0
- Operations: ~$1/month
- **Total: $1–2/month**

## Optimization gotchas

- **Sharp on Vercel:** Sharp requires native bindings. Vercel supports this in their serverless functions. If we use Vercel Edge functions, swap Sharp for `@vercel/og` or similar.
- **Memory limits:** large image processing can hit Vercel's 1 GB memory limit. Reject uploads > 20 MB to be safe.
- **Timeout:** image processing in serverless can be slow. Cap input to 4000x4000 pixels.
- **EXIF privacy:** ALWAYS strip EXIF on user-uploaded photos (removes GPS).

## Things we will NOT do

- ❌ Allow public uploads (only admin)
- ❌ Allow GIF/animated images (use videos elsewhere)
- ❌ Allow SVG uploads (XSS risk unless we sanitize)
- ❌ Store original 20 MB files forever (we keep them for re-processing, but expose only optimized versions)
- ❌ Run face detection or any AI vision (privacy)
