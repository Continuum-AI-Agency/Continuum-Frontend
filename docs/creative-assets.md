# Creative Asset Storage Notes

- **Bucket topology** – Creative assets live in the Supabase Storage bucket indicated by `NEXT_PUBLIC_SUPABASE_CREATIVE_BUCKET` (default: `creative-assets`). Each brand profile keeps its assets under a prefix that matches the brand profile ID:

  ```
  <bucket>/
    <brandProfileId>/
      hero.png
      campaigns/
        launch.mp4
  ```

- **Access control** – Assets remain private by default. The client requests signed URLs via `createSignedAssetUrl(path, expires)` whenever it needs to preview or attach content. For public buckets, set `NEXT_PUBLIC_SUPABASE_STORAGE_PUBLIC=true` to skip signing.

- **Temporary URLs** – The UI currently generates 5‑minute (300s) signed URLs when an asset is dropped onto a content preview. Downstream publishing should refresh these links immediately before submission to ensure validity.

- **Upload & rename semantics** – Uploads are disabled if a file with the same name already exists in the target folder. Renaming moves the underlying object to a new key within the same prefix.

- **Drag & drop metadata** – During drag, the component places a payload of `{ name, path, contentType }` (under the mime type `application/vnd.continuum.asset`) on the data transfer object. Drop targets fetch their own signed URLs, keeping secrets out of the data channel.
