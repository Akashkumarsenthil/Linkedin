import { useRef, useState } from 'react'
import { apiPost } from '../api'
import { Icon } from './Icon'

interface PostComposerProps {
  authorName: string
  authorHeadline?: string | null
  authorPhoto?: string | null
  onPosted: () => void
}

// Client-side image processing: resize to max 1280px, JPEG q0.85
const MAX_DIMENSION = 1280
const JPEG_QUALITY = 0.85

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please choose an image (JPEG, PNG, WEBP).'))
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      reject(new Error('Image must be smaller than 10 MB.'))
      return
    }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read file.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Could not decode image.'))
      img.onload = () => {
        const ratio = Math.min(1, MAX_DIMENSION / img.width, MAX_DIMENSION / img.height)
        const w = Math.round(img.width * ratio)
        const h = Math.round(img.height * ratio)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas unsupported in this browser.'))
          return
        }
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY))
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

export function PostComposer({ authorName, authorHeadline, authorPhoto, onPosted }: PostComposerProps) {
  const [expanded, setExpanded] = useState(false)
  const [content, setContent] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const initials =
    authorName
      .split(' ')
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'U'

  const reset = () => {
    setContent('')
    setImageUrl(null)
    setExpanded(false)
    setError(null)
  }

  const handlePickImage = () => imageInputRef.current?.click()

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    try {
      const url = await fileToDataUrl(file)
      setImageUrl(url)
      setExpanded(true)
      setTimeout(() => textareaRef.current?.focus(), 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load image')
    }
  }

  const handleSubmit = async () => {
    if (!content.trim() && !imageUrl) {
      setError('Write something or add a photo before posting.')
      return
    }
    setPosting(true)
    setError(null)
    try {
      await apiPost('/posts/create', {
        content: content.trim() || ' ', // must be non-empty per schema
        image_url: imageUrl || undefined,
      })
      reset()
      onPosted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post')
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className={`post-composer ${expanded ? 'post-composer-expanded' : ''}`}>
      <div className="post-composer-top">
        <div className="post-composer-avatar">
          {authorPhoto ? (
            <img src={authorPhoto} alt={authorName} className="post-composer-avatar-img" />
          ) : (
            <span>{initials}</span>
          )}
        </div>
        {expanded ? (
          <div className="post-composer-meta">
            <strong>{authorName || 'You'}</strong>
            {authorHeadline && <span className="post-composer-sub">{authorHeadline}</span>}
          </div>
        ) : (
          <button
            type="button"
            className="post-composer-pill"
            onClick={() => {
              setExpanded(true)
              setTimeout(() => textareaRef.current?.focus(), 0)
            }}
          >
            Start a post
          </button>
        )}
      </div>

      {expanded && (
        <>
          <textarea
            ref={textareaRef}
            className="post-composer-text"
            placeholder="What do you want to talk about?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
          />

          {imageUrl && (
            <div className="post-composer-image-preview">
              <img src={imageUrl} alt="" />
              <button
                type="button"
                className="post-composer-image-remove"
                onClick={() => setImageUrl(null)}
                title="Remove image"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          )}

          {error && <p className="error post-composer-error">{error}</p>}
        </>
      )}

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      <div className="post-composer-actions">
        <button
          type="button"
          className="post-composer-tool"
          onClick={handlePickImage}
          title="Add photo"
        >
          <Icon name="image" size={20} className="post-tool-icon post-tool-icon-photo" />
          <span>Photo</span>
        </button>
        <button type="button" className="post-composer-tool" disabled title="Coming soon">
          <Icon name="video" size={20} className="post-tool-icon post-tool-icon-video" />
          <span>Video</span>
        </button>
        <button type="button" className="post-composer-tool" disabled title="Coming soon">
          <Icon name="article" size={20} className="post-tool-icon post-tool-icon-article" />
          <span>Article</span>
        </button>

        {expanded && (
          <div className="post-composer-submit-row">
            <button type="button" className="ghost-btn" onClick={reset} disabled={posting}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              onClick={handleSubmit}
              disabled={posting || (!content.trim() && !imageUrl)}
            >
              {posting ? 'Posting…' : 'Post'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
