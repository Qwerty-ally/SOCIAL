const CLOUD_NAME = 'dtt5ie1ax'
const UPLOAD_PRESET = 'hiiiiiiiii'

export async function uploadMedia(file) {
  const isVideo = file.type.startsWith('video/')
  const isAudio = file.type.startsWith('audio/')
  const endpoint = (isVideo || isAudio) ? 'video' : 'image'

  const form = new FormData()
  form.append('file', file)
  form.append('upload_preset', UPLOAD_PRESET)

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${endpoint}/upload`, {
    method: 'POST',
    body: form,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || 'Upload failed')
  }

  const data = await res.json()
  return { url: data.secure_url, type: isVideo ? 'video' : isAudio ? 'audio' : 'image' }
}

// Keep old name working for profile pic uploads
export async function uploadImage(file) {
  const result = await uploadMedia(file)
  return result.url
}
