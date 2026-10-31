/** Upload an image file and return its URL on this site. */
export async function uploadImage(file: File): Promise<{ url: string } | { error: string }> {
  try {
    const res = await fetch('/api/admin/uploads', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });
    const json = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
    if (res.ok && json?.url) return { url: json.url };
    return {
      error:
        json?.error === 'unsupported_image'
          ? 'Use a JPG, PNG, WebP or GIF image.'
          : res.status === 413
            ? 'The image is larger than 5 MB.'
            : 'Upload failed.',
    };
  } catch {
    return { error: 'Upload failed.' };
  }
}
