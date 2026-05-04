import React, { useState, useEffect } from 'react'
import { Icon } from './Icon'
import { apiPost } from '../api'

interface Article {
  id: number;
  title: string;
  viewers: string;
  time: string;
  content: string;
  url: string;
}

export function NewsPage({ initialNewsId }: { initialNewsId?: number | null }) {
  const [subscribed, setSubscribed] = useState<number[]>([])
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null)
  const [notification, setNotification] = useState<string | null>(null)
  const [isPrefModalOpen, setIsPrefModalOpen] = useState(false)
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [myPrefs, setMyPrefs] = useState<string[]>(JSON.parse(localStorage.getItem('ln-news-prefs') || '["#AI", "#FutureOfWork"]'))
  const [loadingTags, setLoadingTags] = useState(false)
  
  const trendingNews: Article[] = [
    { id: 1, title: 'The future of Generative AI in software engineering', viewers: '45,201', time: '4h ago', content: 'As we look toward 2026, the landscape of software engineering is being fundamentally reshaped by Agentic AI. Developers are moving from writing code to orchestrating complex AI agents that handle entire modules of functionality...', url: 'https://www.technologyreview.com/2024/01/04/1086037/generative-ai-software-engineering/' },
    { id: 2, title: 'Remote work trends: Why hybrid is winning', viewers: '32,110', time: '6h ago', content: 'The debate between full remote and return-to-office has reached a consensus: Hybrid models provide the flexibility employees crave with the face-to-face collaboration that drives innovation.', url: 'https://www.forbes.com/sites/bryanrobinson/2024/02/05/hybrid-work-is-here-to-stay-and-winning-over-remote-and-office-work/' },
    { id: 3, title: 'Top 10 skills for Data Scientists in 2026', viewers: '28,500', time: '1d ago', content: 'Data science is no longer just about cleaning data. The new top skills include LLM orchestration, vector database management, and prompt engineering for enterprise-scale AI systems.', url: 'https://www.datasciencecentral.com/top-10-skills-for-data-scientists-in-2024/' },
    { id: 4, title: 'Silicon Valley outlook: New venture capital surges', viewers: '15,400', time: '2h ago', content: 'A massive wave of new VC funding is hitting the valley, specifically targeting agentic infrastructure startups. Investors are looking for the next layer of the AI stack.', url: 'https://news.crunchbase.com/venture/silicon-valley-funding-trends-2024/' },
  ]

  const newsletters = [
    { id: 1, name: 'AI Frontiers', author: 'Dr. Michael S. Terrell', subscribers: '1.2M', img: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=100&h=100&fit=crop' },
    { id: 2, name: 'Product Pulse', author: 'Sarah Chen', subscribers: '850K', img: 'https://images.unsplash.com/photo-1553877522-43269d4ea984?w=100&h=100&fit=crop' },
    { id: 3, name: 'The Engineering Manager', author: 'James Wilson', subscribers: '500K', img: 'https://images.unsplash.com/photo-1581092921461-eab62e97a780?w=100&h=100&fit=crop' },
  ]

  const showNotify = (msg: string) => {
    setNotification(msg)
    setTimeout(() => setNotification(null), 3000)
  }

  const toggleSub = (id: number) => {
    const isSub = subscribed.includes(id)
    setSubscribed((prev: number[]) => isSub ? prev.filter((x: number) => x !== id) : [...prev, id])
    showNotify(isSub ? 'Unsubscribed successfully' : 'Subscribed successfully!')
  }
  useEffect(() => {
    if (initialNewsId) {
      const found = trendingNews.find(a => a.id === initialNewsId)
      if (found) setSelectedArticle(found)
    }
  }, [initialNewsId])

  const fetchJobTags = async () => {
    setLoadingTags(true)
    try {
      const res = await apiPost<{ data: any[] }>('/jobs/search', { keyword: '', page_size: 50 })
      const allSkills = new Set<string>()
      res.data?.forEach(job => {
        if (Array.isArray(job.skills_required)) {
          job.skills_required.forEach((skill: string) => allSkills.add(`#${skill.replace(/\s+/g, '')}`))
        }
      })
      if (allSkills.size === 0) {
        ['#SoftwareEngineering', '#React', '#MachineLearning', '#ProductManagement'].forEach(s => allSkills.add(s))
      }
      setAvailableTags(Array.from(allSkills).slice(0, 20))
    } catch (e) {
      console.error('Failed to fetch job tags', e)
      setAvailableTags(['#AI', '#Cloud', '#Career', '#Innovation'])
    } finally {
      setLoadingTags(false)
    }
  }

  const togglePref = (tag: string) => {
    const next = myPrefs.includes(tag) ? myPrefs.filter(p => p !== tag) : [...myPrefs, tag]
    setMyPrefs(next)
    localStorage.setItem('ln-news-prefs', JSON.stringify(next))
  }

  const openPrefModal = () => {
    setIsPrefModalOpen(true)
    fetchJobTags()
  }

  return (
    <div className="news-page page-fade premium-panel">
      <style>{`
        .daily-item {
          cursor: pointer;
          transition: background 0.2s;
          display: flex;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid var(--li-border, #e0e0e0);
        }
        .daily-item:last-child {
          border-bottom: none;
        }
        .daily-item:hover {
          background: rgba(0,0,0,0.04);
        }
        .daily-dot {
          width: 8px;
          height: 8px;
          background: #0a66c2;
          border-radius: 50%;
          margin-right: 12px;
        }
        .daily-content {
          flex: 1;
        }
        .daily-title {
          font-size: 14px;
          font-weight: 600;
          margin: 0 0 4px;
          color: rgba(0,0,0,0.9);
        }
        .daily-meta {
          font-size: 12px;
          color: var(--text-muted, #666);
          margin: 0;
        }
        .picks-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        .picks-list li {
          cursor: pointer;
          padding: 12px 16px;
          border-bottom: 1px solid var(--li-border, #e0e0e0);
          font-size: 14px;
          color: #0a66c2;
          font-weight: 500;
          transition: background 0.2s;
        }
        .picks-list li:last-child {
          border-bottom: none;
        }
        .picks-list li:hover {
          background: rgba(10, 102, 194, 0.05);
          text-decoration: underline;
        }
        .newsletter-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 16px;
          padding: 16px;
        }
        .newsletter-card {
          border: 1px solid var(--li-border, #e0e0e0);
          border-radius: 8px;
          overflow: hidden;
          background: white;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .newsletter-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        .nl-img {
          width: 100%;
          height: 120px;
          object-fit: crop;
        }
        .nl-info {
          padding: 12px;
        }
        .nl-info h4 {
          margin: 0 0 4px;
          font-size: 15px;
        }
        .nl-author {
          font-size: 12px;
          color: var(--text-muted);
          margin: 0 0 4px;
        }
        .nl-subs {
          font-size: 12px;
          color: var(--text-muted);
          margin: 0 0 12px;
        }
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.7);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(4px);
        }
        .modal-content {
          background: white;
          border-radius: 12px;
          box-shadow: 0 12px 48px rgba(0,0,0,0.3);
          animation: modalSlideUp 0.3s ease-out;
          width: 100%;
        }
        @keyframes modalSlideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .toast-notify {
          position: fixed;
          bottom: 24px;
          left: 50%;
          transform: translateX(-50%);
          background: #333;
          color: white;
          padding: 12px 24px;
          border-radius: 8px;
          z-index: 10000;
          font-weight: 600;
          animation: slideUpToast 0.3s ease-out;
        }
        @keyframes slideUpToast {
          from { transform: translate(-50%, 100%); opacity: 0; }
          to { transform: translate(-50%, 0); opacity: 1; }
        }
      `}</style>

      <header className="news-header premium-header">
        <div>
          <h2 className="premium-title">LinkedIn News</h2>
          <p className="premium-subtitle">Stay updated with professional trends and newsletters</p>
        </div>
      </header>

      <div className="news-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px', padding: '20px' }}>
        <div className="news-main">
          <section className="news-section premium-panel">
            <div className="premium-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="premium-title" style={{ fontSize: 15 }}>Top Newsletters</span>
              <button className="stat-link" onClick={() => showNotify('Discovery feature coming soon!')}>Discover more</button>
            </div>
            <div className="newsletter-grid">
              {newsletters.map(n => (
                <div key={n.id} className="newsletter-card">
                  <img src={n.img} alt={n.name} className="nl-img" />
                  <div className="nl-info">
                    <h4>{n.name}</h4>
                    <p className="nl-author">By {n.author}</p>
                    <p className="nl-subs">{n.subscribers} subscribers</p>
                    <button 
                      className={subscribed.includes(n.id) ? "primary btn-sm" : "secondary-btn btn-sm"}
                      style={{ width: '100%' }}
                      onClick={() => toggleSub(n.id)}
                    >
                      {subscribed.includes(n.id) ? '✓ Subscribed' : 'Subscribe'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="news-section premium-panel" style={{ marginTop: '16px' }}>
            <div className="premium-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="premium-title" style={{ fontSize: 15 }}>Professional Daily</span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles' })}</span>
            </div>
            <div className="daily-list">
              {trendingNews.map(news => (
                <div key={news.id} className="daily-item" onClick={() => { setSelectedArticle(news); if (news.url) window.open(news.url, '_blank'); }}>
                  <div className="daily-dot" />
                  <div className="daily-content">
                    <h4 className="daily-title">{news.title}</h4>
                    <p className="daily-meta">{news.time} • {news.viewers} readers</p>
                  </div>
                  <Icon name="arrow-right" size={16} color="#666" />
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="news-sidebar">
          <div className="sidebar-card premium-panel">
            <div className="premium-header">
              <span className="premium-title" style={{ fontSize: 14 }}>News Settings</span>
            </div>
            <div style={{ padding: '16px' }}>
              <p style={{ fontSize: 13, color: 'var(--text-sec)', marginBottom: 12 }}>Customize your feed and preferences.</p>
              <div className="pref-chips" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                {myPrefs.map(p => (
                  <span key={p} style={{ background: '#f3f6f8', padding: '4px 10px', borderRadius: '16px', fontSize: '12px', color: '#0a66c2', fontWeight: 600 }}>{p}</span>
                ))}
              </div>
              <button className="btn-green" style={{ width: '100%' }} onClick={openPrefModal}>Edit Preferences</button>
            </div>
          </div>
          
          <div className="sidebar-card premium-panel" style={{ marginTop: '16px' }}>
            <div className="premium-header">
              <span className="premium-title" style={{ fontSize: 14 }}>Editors' Picks</span>
            </div>
            <ul className="picks-list">
              <li onClick={() => showNotify('Opening Editor Pick...')}>How to negotiate your salary in 2026</li>
              <li onClick={() => showNotify('Opening Editor Pick...')}>The rise of agentic AI in the workplace</li>
              <li onClick={() => showNotify('Opening Editor Pick...')}>Mental health tips for tech professionals</li>
            </ul>
          </div>
        </aside>
      </div>

      {/* Article Modal */}
      {selectedArticle && (
        <div className="modal-overlay" onClick={() => setSelectedArticle(null)}>
          <div className="modal-content" style={{ maxWidth: '600px', padding: '24px', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <header className="modal-header" style={{ border: 'none', padding: '0 0 16px', display: 'flex', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: '20px', margin: 0 }}>{selectedArticle.title}</h2>
              <button className="modal-close" onClick={() => setSelectedArticle(null)} style={{ background: 'none', border: 'none', fontSize: '28px', cursor: 'pointer', color: '#666' }}>×</button>
            </header>
            <div className="modal-body" style={{ padding: 0 }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '16px' }}>{selectedArticle.time} • {selectedArticle.viewers} readers</p>
              <div style={{ lineHeight: 1.8, fontSize: '16px', color: 'rgba(0,0,0,0.8)' }}>{selectedArticle.content}</div>
            </div>
            <footer className="modal-footer" style={{ border: 'none', padding: '24px 0 0', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="primary" onClick={() => setSelectedArticle(null)}>Done Reading</button>
            </footer>
          </div>
        </div>
      )}

      {/* Preferences Modal */}
      {isPrefModalOpen && (
        <div className="modal-overlay" onClick={() => setIsPrefModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '500px', padding: '24px', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <header className="modal-header" style={{ border: 'none', padding: '0 0 16px', display: 'flex', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: '18px', margin: 0 }}>News Feed Preferences</h2>
              <button className="modal-close" onClick={() => setIsPrefModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' }}>×</button>
            </header>
            <div className="modal-body">
              <p style={{ fontSize: '14px', color: '#666', marginBottom: '16px' }}>Select hashtags from our job database to personalize your professional feed.</p>
              {loadingTags ? (
                <div style={{ textAlign: 'center', padding: '20px' }}>Loading job tags...</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', maxHeight: '300px', overflowY: 'auto', padding: '4px' }}>
                  {availableTags.map(tag => (
                    <button
                      key={tag}
                      onClick={() => togglePref(tag)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '20px',
                        border: '1px solid #0a66c2',
                        background: myPrefs.includes(tag) ? '#0a66c2' : 'white',
                        color: myPrefs.includes(tag) ? 'white' : '#0a66c2',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 600,
                        transition: 'all 0.2s'
                      }}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <footer style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="primary" onClick={() => setIsPrefModalOpen(false)}>Save & Close</button>
            </footer>
          </div>
        </div>
      )}

      {notification && <div className="toast-notify">{notification}</div>}
    </div>
  )
}
