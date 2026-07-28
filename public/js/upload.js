export async function uploadOne({ file, blob, key, token, conflictPolicy, signal }) {
  const formData = new FormData();
  formData.append("file", blob, key.split("/").at(-1));
  formData.append("key", key);
  formData.append("contentType", "image/webp");
  formData.append("conflictPolicy", conflictPolicy);

  const response = await fetch("/api/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
    signal,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    const error = new Error(payload?.error || `${file.name} 上传失败。`);
    error.status = response.status;
    throw error;
  }
  return payload;
}
