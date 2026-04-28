import { useState, useEffect } from 'react'
import { apiGet } from '../api'
import { PostCard } from './PostCard'
import { Icon } from './Icon'

interface SavedItemsPageProps {
  me: any
  onNavigateProfile: (id: number | null) => void
}

export function SavedItemsPage({ me, onNavigateProfile }: SavedItemsPageProps) {
  const [savedPosts, setSavedPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const savedIds: number[] = JSON.parse(localStorage.getItem('ln-saved-posts') || '[]')
    if (savedIds.length === 0) {
      setLoading(false)
      return
    }

    const fetchSaved = async () => {
      try {
        const results = await Promise.all(
          savedIds.map(id => apiGet<any>(`/posts/${id}`))
        )
        setSavedPosts(results.filter(r => r.success).map(r => r.data))
      } catch (err) {
        console.error('Failed to fetch saved posts', err)
      } finally {
        setLoading(false)
      }
    }

    void fetchSaved()
  }, [])

  const handleUnsave = (postId: number) => {
    const savedIds: number[] = JSON.parse(localStorage.getItem('ln-saved-posts') || '[]')
    const next = savedIds.filter(id => id !== postId)
    localStorage.setItem('ln-saved-posts', JSON.stringify(next))
    setSavedPosts(prev => prev.filter(p => p.post_id !== postId))
  }

  return (
    <div className="saved-items-page page-fade">
      <header className="page-header">
        <div className="header-left">
          <h1>Saved items</h1>
          <p>Posts and articles you've saved for later</p>
        </div>
      </header>

      <div className="saved-content">
        {loading ? (
          <div className="loading-state">Loading your saved items...</div>
        ) : savedPosts.length > 0 ? (
          <div className="posts-list">
            {savedPosts.map(post => (
              <PostCard 
                key={post.post_id} 
                post={post} 
                me={me} 
                onNavigateProfile={onNavigateProfile}
                // Custom prop or logic to handle unsave if needed
              />
            ))}
          </div>
        ) : (
          <div className="empty-state li-card">
            <Icon name="bookmark" size={48} />
            <h2>No saved posts yet</h2>
            <p>Save posts from your feed to see them here.</p>
          </div>
        )}
      </div>
    </div>
  )
}
