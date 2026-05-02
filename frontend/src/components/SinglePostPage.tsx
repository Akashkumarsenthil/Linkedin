import { useEffect, useState } from 'react'
import { apiGet, parseStoredUser } from '../api'
import { PostCard, type FeedPost } from './PostCard'
import { Icon } from './Icon'

interface SinglePostPageProps {
  postId: number
  onNavigateProfile: (id?: number) => void
  onBack: () => void
}

export function SinglePostPage({ postId, onNavigateProfile, onBack }: SinglePostPageProps) {
  const [post, setPost] = useState<FeedPost | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const user = parseStoredUser()

  useEffect(() => {
    async function fetchPost() {
      setLoading(true)
      try {
        const res = await apiGet<{ success?: boolean; message?: string; data?: FeedPost }>(`/posts/${postId}`)
        if (res.success === false) {
          throw new Error(res.message || 'Post not found')
        }
        if (!res.data) {
          throw new Error('Post not found')
        }
        setPost(res.data)
      } catch (err: any) {
        setError(err.message || 'Failed to load post')
      } finally {
        setLoading(false)
      }
    }
    void fetchPost()
  }, [postId])

  if (!user) return null

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', paddingTop: 20, paddingBottom: 40, width: '100%' }}>
      <div style={{ marginBottom: 16 }}>
        <button 
          type="button" 
          className="ghost-btn" 
          onClick={onBack}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px' }}
        >
          <Icon name="arrow-left" size={16} />
          Back
        </button>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-sec)' }}>Loading post...</div>}
      {error && (
        <div style={{ background: '#fef0f0', color: '#d32f2f', padding: 16, borderRadius: 8, textAlign: 'center', border: '1px solid #fbcaca' }}>
          {error}
        </div>
      )}
      {!loading && !error && post && (
        <PostCard
          post={post}
          currentUserId={user.user_id}
          currentUserType={user.user_type}
          currentUserPhoto={user.profile?.profile_photo_url as string || null}
          currentUserName={`${user.profile?.first_name || ''} ${user.profile?.last_name || ''}`.trim() || user.email}
          isSaved={false}
          onToggleSave={() => {}}
          onDeleted={() => onBack()}
          onNavigateProfile={onNavigateProfile}
        />
      )}
    </div>
  )
}
