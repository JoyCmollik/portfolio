# Portrait and visual design guide

## Included assets

- `design-assets/original-user-portrait.jpeg`: original image supplied for this project, retained unchanged.
- `design-assets/hero-cutout-transparent.png`: edited transparent-background variant, usable in Photoshop, Affinity Photo, or other layered-image software. This is an edited rendition, not an untouched reproduction.
- `apps/web/public/images/joy-portrait.webp`: optimized tapered-hawk studio portrait used on the About page.
- `apps/web/public/images/joy-hero.webp`: production-optimized tapered-hawk studio portrait used on the homepage.
- `design-assets/joy-tapered-hawk-studio-portrait.png`: full-resolution generated retouch, including black T-shirt, subtle side taper / curly faux hawk, and warm rim lighting.
- `preview/portfolio-preview.png`: static screenshot of the updated design at desktop size.

## Editing in Photoshop (optional)

1. Open `design-assets/joy-tapered-hawk-studio-portrait.png` in Photoshop for further hair, light, or color edits. The original portrait JPEG is retained unchanged.
2. Export the edited result as a 3:4 WebP at about 1080px wide (quality 85–92). The homepage hero uses a full-bleed photograph with a CSS vignette rather than a cutout.
3. Replace `apps/web/public/images/joy-hero.webp` and optionally `joy-portrait.webp`, or upload the image through the admin dashboard and save the new image URL. The transparent PNG remains an optional alternative if you prefer the old cutout design.
4. For the original rectangular About photo, preserve a portrait 3:4 aspect ratio and export high-quality WebP.
5. Test the mobile hero placement and keep face/eyes away from the headline. The homepage portrait styles are the `.home-portrait*` classes in `apps/web/src/components/home/hero.css` (crop via `object-position` on `.home-portrait__img`); the About page portrait uses the `.about-portrait*` classes in `apps/web/src/pages/about.css`.

There is no layered `.psd` in this package. The full-resolution studio PNG, earlier transparent cutout PNG, and the original JPEG are included for further retouching. The studio image is an AI-edited likeness and may differ subtly from the original photo.
