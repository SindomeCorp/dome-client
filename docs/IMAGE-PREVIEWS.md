# Inline media previews

The output buffer recognizes HTTP and HTTPS media links by parsing the URL and
checking its pathname. Matching is case-insensitive and requires a dot followed by
a supported extension at the end of the path. Query strings and fragments do not
affect detection and remain attached to the URL used to load the media.

- Images: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.avif`, `.svg`.
- Videos: `.mp4`, `.gifv`. GIFV preview requests use the same URL with the pathname
  extension changed to `.mp4`, preserving the query string and fragment.
- Recognized YouTube links retain their existing embedded-player behavior.

| URL | Result |
| --- | --- |
| `https://example.com/photo.JPEG?width=400` | Image preview control |
| `https://example.com/photo.webp#detail` | Image preview control |
| `https://example.com/myjpgarticle` | Link only |
| `https://example.com/view?file=photo.png` | Link only |
| `https://png.example.com/page` | Link only |
| `https://sindo.me/abc123` | Link only |

**Show Preview of Images** controls automatic expansion and defaults to off.
Eligible links still have a chevron for manual expansion. Both modes use the same
media-extension detection.

Image previews, including SVGs, use an `<img>` element with a maximum width of
75% of the containing output area. Height follows the browser's image sizing;
there is no explicit maximum height, so tall images can occupy substantial vertical
space. SVG markup is not inserted directly into the page.

Detection does not fetch metadata, inspect Content-Type, or resolve redirects.
A matching URL creates a preview control; actual display still depends on the
destination serving usable media and the browser allowing it. For example, an HTTP
image embedded in an HTTPS client may be subject to browser mixed-content handling.

## Shortened links

Shortening happens before output reaches the browser. If an image URL becomes an
opaque short link, its original extension is no longer available for detection.
HTTPS support does not change that: `https://sindo.me/abc123` stays a clickable link
without an automatic image-preview control. No short-link expansion is performed.

See [URL Shortener](URL-SHORTENER.md) for `SHORTEN_DOMAIN` and `SHORTEN_USE_HTTPS`.
The latter defaults to `true` and controls the scheme of generated public links;
it does not change media detection or the backend shortener API transport.
